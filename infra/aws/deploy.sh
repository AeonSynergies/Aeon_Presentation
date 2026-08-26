#!/usr/bin/env bash
# Idempotent AWS provisioning + deploy for the Aeon Presentation Platform.
#
# Safe to run repeatedly: every resource is created only if it doesn't already exist
# (checked by name/id), so this doubles as both the one-time bootstrap and the ongoing
# "push to main" deploy step — there is only one code path to maintain. Requires AWS
# credentials in the environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) and the AWS
# CLI v2. Run from the repo root.
#
# What this does, in order: ECR repos -> default VPC/subnets -> security groups ->
# DB + cache subnet groups -> RDS Postgres -> ElastiCache Redis -> IAM roles for App
# Runner -> SSM SecureString params for secrets -> App Runner VPC connector -> build/push
# the api image -> create-or-redeploy the api App Runner service -> build/push the web
# image (baking in the api service's URL) -> create-or-redeploy the web App Runner
# service -> point the api service's WEB_ORIGIN at the web service's URL.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PROJECT="aeon"
DB_INSTANCE_ID="${PROJECT}-postgres"
CACHE_CLUSTER_ID="${PROJECT}-redis"
DB_NAME="aeon"
DB_MASTER_USER="aeonadmin"

log() { echo "==> $*"; }

aws_() { aws --region "$REGION" "$@"; }

# Polls an App Runner service until it's RUNNING, logging the status each check (so a
# stuck run is visible in the log instead of just going silent), and giving up — via
# return 1, not exit — after ~15 minutes or a terminal failure state, rather than looping
# on `= "RUNNING"` forever, which is what actually happened here: a service that never
# reached RUNNING just burned the entire 45-minute job timeout in silence, with the real
# status (visible only via a live `describe-service`) never making it into the log at
# all. Returns non-zero instead of exiting so callers that have a recovery path (see
# ensure_apprunner_service_usable below) can act on the failure instead of the whole
# script dying here.
wait_for_apprunner_service() {
  local service_arn="$1" label="$2"
  local max_attempts=60 attempt=0 status
  while true; do
    status="$(aws_ apprunner describe-service --service-arn "$service_arn" --query 'Service.Status' --output text)"
    log "$label status: $status (check $((attempt + 1))/$max_attempts)"
    if [ "$status" = "RUNNING" ]; then
      return 0
    fi
    if [ "$status" = "CREATE_FAILED" ] || [ "$status" = "DELETE_FAILED" ]; then
      log "$label ended up in $status, not RUNNING"
      return 1
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      log "$label did not reach RUNNING after $((max_attempts * 15 / 60)) minutes (still $status)"
      return 1
    fi
    sleep 15
  done
}

# Hard-fails the whole script if the service doesn't reach RUNNING. Used right after a
# fresh create/redeploy/update, where there's no recovery path left to try — unlike
# ensure_apprunner_service_usable below, which handles a service found already broken.
require_apprunner_running() {
  local service_arn="$1" label="$2"
  if ! wait_for_apprunner_service "$service_arn" "$label"; then
    echo "App Runner service $label did not reach RUNNING — giving up rather than waiting out the job timeout." >&2
    echo "Check the AWS console (App Runner -> $label -> Logs, both deployment and application logs) for why." >&2
    exit 1
  fi
}

# Looks up a service by name. list-services conveniently reports Status too, so this
# covers what would otherwise be a separate describe-service call. Echoes "ARN STATUS",
# or nothing if no service with this name exists.
apprunner_find_service() {
  local name="$1"
  aws_ apprunner list-services \
    --query "ServiceSummaryList[?ServiceName=='${name}'].[ServiceArn,Status] | [0]" --output text
}

# Deletes a service and waits for the delete to actually finish, so the caller can safely
# create a replacement in its place afterward.
delete_apprunner_service() {
  local service_arn="$1" label="$2"
  log "Deleting ${label} and waiting for the delete to finish"
  aws_ apprunner delete-service --service-arn "$service_arn" >/dev/null
  local attempt=0 status
  while true; do
    status="$(aws_ apprunner list-services --query "ServiceSummaryList[?ServiceArn=='${service_arn}'].Status | [0]" --output text)"
    if [ -z "$status" ] || [ "$status" = "None" ] || [ "$status" = "DELETED" ]; then
      log "${label} delete finished"
      return 0
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 40 ]; then
      echo "${label} was still ${status} after 10 minutes of trying to delete it — giving up." >&2
      exit 1
    fi
    log "${label} delete in progress (status: ${status})"
    sleep 15
  done
}

# Given a service that list-services already found by name, decides whether it's safe to
# StartDeployment on it (only works when it's RUNNING). A service can exist but be
# unusable: still finishing a prior operation, or — as happened here — stuck in
# CREATE_FAILED because a previous run's wait loop hung and the job got killed before it
# could tell. Waits out an in-flight operation first; anything that isn't RUNNING after
# that gets deleted so the caller creates a clean replacement instead of calling
# StartDeployment on a service that can't accept one. Echoes the service's
# StatusChangeReason (if the API reports one) so the actual cause shows up in the log.
ensure_apprunner_service_usable() {
  local service_arn="$1" label="$2" status="$3"
  if [ "$status" = "OPERATION_IN_PROGRESS" ]; then
    log "${label} is mid-operation — waiting for it to settle before deciding what to do"
    if wait_for_apprunner_service "$service_arn" "$label"; then
      return 0
    fi
    status="$(aws_ apprunner describe-service --service-arn "$service_arn" --query 'Service.Status' --output text)"
  fi
  if [ "$status" = "RUNNING" ]; then
    return 0
  fi
  local reason
  reason="$(aws_ apprunner describe-service --service-arn "$service_arn" --query 'Service.StatusChangeReason' --output text 2>/dev/null || echo "")"
  log "${label} exists but is ${status} (reason: ${reason:-none reported}), not RUNNING — StartDeployment won't work on it"
  delete_apprunner_service "$service_arn" "$label"
  return 1
}

ACCOUNT_ID="$(aws_ sts get-caller-identity --query Account --output text)"
log "Account: $ACCOUNT_ID  Region: $REGION"

# ============================================================
# ECR
# ============================================================
ensure_ecr_repo() {
  local name="$1"
  if ! aws_ ecr describe-repositories --repository-names "$name" >/dev/null 2>&1; then
    log "Creating ECR repo $name"
    aws_ ecr create-repository --repository-name "$name" --image-scanning-configuration scanOnPush=true >/dev/null
  else
    log "ECR repo $name already exists"
  fi
}
ensure_ecr_repo "${PROJECT}-api"
ensure_ecr_repo "${PROJECT}-web"

ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
ECR_API_URI="${ECR_REGISTRY}/${PROJECT}-api"
ECR_WEB_URI="${ECR_REGISTRY}/${PROJECT}-web"

aws_ ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null

# ============================================================
# Default VPC + subnets
# ============================================================
VPC_ID="$(aws_ ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
  echo "No default VPC found in $REGION. This script assumes one exists; create a VPC and adjust the script to point at it." >&2
  exit 1
fi
mapfile -t SUBNET_IDS < <(aws_ ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" --query 'Subnets[].SubnetId' --output text | tr '\t' '\n')
if [ "${#SUBNET_IDS[@]}" -lt 2 ]; then
  echo "Need at least 2 subnets (in different AZs) in the default VPC for RDS; found ${#SUBNET_IDS[@]}." >&2
  exit 1
fi
log "Default VPC: $VPC_ID  Subnets: ${SUBNET_IDS[*]}"

# ============================================================
# Security groups: one for the App Runner VPC connector, one for RDS/ElastiCache that
# only accepts traffic from the connector's security group.
# ============================================================
get_sg_id() {
  aws_ ec2 describe-security-groups --filters Name=group-name,Values="$1" Name=vpc-id,Values="$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true
}

APP_SG_NAME="${PROJECT}-apprunner-sg"
APP_SG_ID="$(get_sg_id "$APP_SG_NAME")"
if [ -z "$APP_SG_ID" ] || [ "$APP_SG_ID" = "None" ]; then
  log "Creating security group $APP_SG_NAME"
  APP_SG_ID="$(aws_ ec2 create-security-group --group-name "$APP_SG_NAME" \
    --description "App Runner VPC connector for ${PROJECT}" --vpc-id "$VPC_ID" --query GroupId --output text)"
else
  log "Security group $APP_SG_NAME already exists ($APP_SG_ID)"
fi

DB_SG_NAME="${PROJECT}-db-sg"
DB_SG_ID="$(get_sg_id "$DB_SG_NAME")"
if [ -z "$DB_SG_ID" ] || [ "$DB_SG_ID" = "None" ]; then
  log "Creating security group $DB_SG_NAME"
  DB_SG_ID="$(aws_ ec2 create-security-group --group-name "$DB_SG_NAME" \
    --description "RDS + ElastiCache for ${PROJECT}, App Runner connector only" --vpc-id "$VPC_ID" --query GroupId --output text)"
  aws_ ec2 authorize-security-group-ingress --group-id "$DB_SG_ID" --protocol tcp --port 5432 --source-group "$APP_SG_ID" >/dev/null
  aws_ ec2 authorize-security-group-ingress --group-id "$DB_SG_ID" --protocol tcp --port 6379 --source-group "$APP_SG_ID" >/dev/null
else
  log "Security group $DB_SG_NAME already exists ($DB_SG_ID)"
fi

# ============================================================
# RDS for PostgreSQL — smallest instance (db.t4g.micro), NOT publicly accessible.
# See README for why: ElastiCache has no public-access mode at all, so an App Runner
# VPC Connector is required regardless: once that exists, keeping RDS private too is
# free (same connector, same security group) and strictly more secure than making it
# public for convenience.
# ============================================================
DB_PARAM_NAME="/${PROJECT}/DATABASE_URL"
if aws_ rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" >/dev/null 2>&1; then
  log "RDS instance $DB_INSTANCE_ID already exists"
else
  log "Creating DB subnet group"
  aws_ rds create-db-subnet-group --db-subnet-group-name "${PROJECT}-db-subnet-group" \
    --db-subnet-group-description "${PROJECT} RDS subnet group" --subnet-ids "${SUBNET_IDS[@]}" >/dev/null 2>&1 || true

  DB_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)"
  log "Creating RDS instance $DB_INSTANCE_ID (db.t4g.micro, 20GB gp3, not publicly accessible)"
  aws_ rds create-db-instance \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --db-instance-class db.t4g.micro \
    --engine postgres \
    --master-username "$DB_MASTER_USER" \
    --master-user-password "$DB_PASSWORD" \
    --allocated-storage 20 \
    --storage-type gp3 \
    --db-name "$DB_NAME" \
    --vpc-security-group-ids "$DB_SG_ID" \
    --db-subnet-group-name "${PROJECT}-db-subnet-group" \
    --no-publicly-accessible \
    --backup-retention-period 1 \
    --no-multi-az >/dev/null

  log "Waiting for RDS instance to become available (this takes several minutes)..."
  aws_ rds wait db-instance-available --db-instance-identifier "$DB_INSTANCE_ID"

  RDS_ENDPOINT="$(aws_ rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" \
    --query 'DBInstances[0].Endpoint.Address' --output text)"
  DATABASE_URL="postgresql://${DB_MASTER_USER}:${DB_PASSWORD}@${RDS_ENDPOINT}:5432/${DB_NAME}"

  log "Storing DATABASE_URL in SSM Parameter Store ($DB_PARAM_NAME)"
  aws_ ssm put-parameter --name "$DB_PARAM_NAME" --type SecureString --value "$DATABASE_URL" --overwrite >/dev/null
fi

# ============================================================
# ElastiCache for Redis — smallest node (cache.t3.micro, the type actually covered by
# AWS's legacy free tier; cache.t4g.micro is not). Always VPC-only; no public option
# exists for ElastiCache regardless of instance size.
# ============================================================
REDIS_PARAM_NAME="/${PROJECT}/REDIS_URL"
if aws_ elasticache describe-cache-clusters --cache-cluster-id "$CACHE_CLUSTER_ID" >/dev/null 2>&1; then
  log "ElastiCache cluster $CACHE_CLUSTER_ID already exists"
else
  log "Creating ElastiCache subnet group"
  aws_ elasticache create-cache-subnet-group --cache-subnet-group-name "${PROJECT}-cache-subnet-group" \
    --cache-subnet-group-description "${PROJECT} ElastiCache subnet group" --subnet-ids "${SUBNET_IDS[@]}" >/dev/null 2>&1 || true

  log "Creating ElastiCache cluster $CACHE_CLUSTER_ID (cache.t3.micro, single node)"
  aws_ elasticache create-cache-cluster \
    --cache-cluster-id "$CACHE_CLUSTER_ID" \
    --engine redis \
    --cache-node-type cache.t3.micro \
    --num-cache-nodes 1 \
    --cache-subnet-group-name "${PROJECT}-cache-subnet-group" \
    --security-group-ids "$DB_SG_ID" >/dev/null

  log "Waiting for ElastiCache cluster to become available..."
  aws_ elasticache wait cache-cluster-available --cache-cluster-id "$CACHE_CLUSTER_ID"

  REDIS_ENDPOINT="$(aws_ elasticache describe-cache-clusters --cache-cluster-id "$CACHE_CLUSTER_ID" --show-cache-node-info \
    --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text)"
  REDIS_URL="redis://${REDIS_ENDPOINT}:6379"

  log "Storing REDIS_URL in SSM Parameter Store ($REDIS_PARAM_NAME)"
  aws_ ssm put-parameter --name "$REDIS_PARAM_NAME" --type String --value "$REDIS_URL" --overwrite >/dev/null
fi

# ============================================================
# JWT signing secret — generated once, persisted, never rotated by this script.
# ============================================================
JWT_PARAM_NAME="/${PROJECT}/JWT_ACCESS_SECRET"
if ! aws_ ssm get-parameter --name "$JWT_PARAM_NAME" >/dev/null 2>&1; then
  log "Generating and storing JWT_ACCESS_SECRET"
  aws_ ssm put-parameter --name "$JWT_PARAM_NAME" --type SecureString \
    --value "$(openssl rand -hex 32)" >/dev/null
fi

DB_PARAM_ARN="arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter${DB_PARAM_NAME}"
JWT_PARAM_ARN="arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter${JWT_PARAM_NAME}"

# ============================================================
# IAM roles for App Runner
# ============================================================
ensure_role() {
  local role_name="$1" trust_service="$2"
  if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
    log "IAM role $role_name already exists"
    return
  fi
  log "Creating IAM role $role_name"
  local trust_doc
  trust_doc=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "${trust_service}"},
    "Action": "sts:AssumeRole"
  }]
}
EOF
)
  aws iam create-role --role-name "$role_name" --assume-role-policy-document "$trust_doc" >/dev/null
}

ensure_role "${PROJECT}-apprunner-ecr-access" "build.apprunner.amazonaws.com"
aws iam attach-role-policy --role-name "${PROJECT}-apprunner-ecr-access" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess >/dev/null 2>&1 || true
ECR_ACCESS_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${PROJECT}-apprunner-ecr-access"

ensure_role "${PROJECT}-apprunner-instance" "tasks.apprunner.amazonaws.com"
INSTANCE_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${PROJECT}-apprunner-instance"
# Both params are SecureString, so reading them at runtime (App Runner's
# RuntimeEnvironmentSecrets injection, done by this instance role before the container
# ever starts) needs kms:Decrypt on the key that encrypted them, not just ssm:GetParameter
# — a very easy permission to forget, and one that fails silently from this script's
# point of view: the deployment just dies with Status=CREATE_FAILED and an empty
# StatusChangeReason, since App Runner never gets far enough to run (or log) the
# container. Scoped via ViaService instead of a hardcoded key ARN so it works with
# whatever key SSM used (the account default alias/aws/ssm unless overridden) without an
# extra lookup call.
SSM_POLICY_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameters", "ssm:GetParameter"],
      "Resource": ["${DB_PARAM_ARN}", "${JWT_PARAM_ARN}"]
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {"StringEquals": {"kms:ViaService": "ssm.${REGION}.amazonaws.com"}}
    }
  ]
}
EOF
)
aws iam put-role-policy --role-name "${PROJECT}-apprunner-instance" \
  --policy-name "${PROJECT}-read-secrets" --policy-document "$SSM_POLICY_DOC" >/dev/null

# IAM changes can take a few seconds to propagate before App Runner can assume the role.
sleep 10

# ============================================================
# App Runner VPC Connector (shared by the api service to reach RDS/ElastiCache).
# App Runner isn't available in every AZ in a region — there's no CLI/API to list which
# AZs are supported, only a CreateVpcConnector failure naming the specific unsupported
# subnet(s). So: try with every default-VPC subnet, and on that specific error, drop the
# named subnet(s) and retry. App Runner only needs one working subnet for the connector
# (unlike RDS/ElastiCache, which is why SUBNET_IDS itself — used for those — is left
# untouched; this operates on a copy).
# ============================================================
CONNECTOR_NAME="${PROJECT}-connector"
CONNECTOR_ARN="$(aws_ apprunner list-vpc-connectors --query "VpcConnectors[?VpcConnectorName=='${CONNECTOR_NAME}' && Status=='ACTIVE'].VpcConnectorArn | [0]" --output text)"
if [ -z "$CONNECTOR_ARN" ] || [ "$CONNECTOR_ARN" = "None" ]; then
  CONNECTOR_SUBNETS=("${SUBNET_IDS[@]}")
  while true; do
    log "Creating App Runner VPC connector $CONNECTOR_NAME (subnets: ${CONNECTOR_SUBNETS[*]})"
    CREATE_ERR_FILE="$(mktemp)"
    if CONNECTOR_ARN="$(aws_ apprunner create-vpc-connector --vpc-connector-name "$CONNECTOR_NAME" \
        --subnets "${CONNECTOR_SUBNETS[@]}" --security-groups "$APP_SG_ID" \
        --query 'VpcConnector.VpcConnectorArn' --output text 2>"$CREATE_ERR_FILE")"; then
      rm -f "$CREATE_ERR_FILE"
      break
    fi
    CREATE_ERR="$(cat "$CREATE_ERR_FILE")"
    rm -f "$CREATE_ERR_FILE"
    echo "$CREATE_ERR" >&2
    if ! echo "$CREATE_ERR" | grep -q "don't support App Runner services"; then
      echo "CreateVpcConnector failed for a reason this script doesn't know how to work around." >&2
      exit 1
    fi
    mapfile -t BAD_SUBNETS < <(echo "$CREATE_ERR" | grep -oP 'subnet-[a-z0-9]+(?=\()')
    if [ "${#BAD_SUBNETS[@]}" -eq 0 ]; then
      echo "AWS named unsupported subnet(s) but this script couldn't parse the subnet id(s) out of the error above." >&2
      exit 1
    fi
    log "App Runner doesn't support the AZ(s) for: ${BAD_SUBNETS[*]} — excluding and retrying"
    # Note: deliberately not `[ cond ] && action` here — under `set -e` a bare "test &&
    # action" statement aborts the whole script the moment the test is false (the normal,
    # non-error case for most of these comparisons), not just when something actually errors.
    NEXT_SUBNETS=()
    for s in "${CONNECTOR_SUBNETS[@]}"; do
      is_bad=false
      for b in "${BAD_SUBNETS[@]}"; do
        if [ "$s" = "$b" ]; then
          is_bad=true
          break
        fi
      done
      if [ "$is_bad" = false ]; then
        NEXT_SUBNETS+=("$s")
      fi
    done
    if [ "${#NEXT_SUBNETS[@]}" -eq 0 ]; then
      echo "Every default-VPC subnet was rejected as unsupported for an App Runner VPC connector; none left to try." >&2
      exit 1
    fi
    CONNECTOR_SUBNETS=("${NEXT_SUBNETS[@]}")
  done
  log "Waiting for VPC connector to become active..."
  until [ "$(aws_ apprunner describe-vpc-connector --vpc-connector-arn "$CONNECTOR_ARN" --query 'VpcConnector.Status' --output text)" = "ACTIVE" ]; do
    sleep 10
  done
else
  log "App Runner VPC connector $CONNECTOR_NAME already active"
fi

# ============================================================
# Build + push images
# ============================================================
GIT_SHA="$(git rev-parse --short HEAD)"
log "Building api image"
docker build -f apps/api/Dockerfile -t "${ECR_API_URI}:latest" -t "${ECR_API_URI}:${GIT_SHA}" .
docker push "${ECR_API_URI}:latest"
docker push "${ECR_API_URI}:${GIT_SHA}"

# ============================================================
# api App Runner service (create once, redeploy on subsequent runs)
# ============================================================
API_SERVICE_INFO="$(apprunner_find_service "${PROJECT}-api")"
API_SERVICE_ARN="$(awk '{print $1}' <<< "$API_SERVICE_INFO")"
API_SERVICE_STATUS="$(awk '{print $2}' <<< "$API_SERVICE_INFO")"
if [ "$API_SERVICE_ARN" = "None" ] || [ -z "$API_SERVICE_ARN" ]; then
  API_SERVICE_ARN=""
elif ! ensure_apprunner_service_usable "$API_SERVICE_ARN" "${PROJECT}-api" "$API_SERVICE_STATUS"; then
  API_SERVICE_ARN=""
fi

if [ -z "$API_SERVICE_ARN" ]; then
  log "Creating App Runner service ${PROJECT}-api"
  SRC_CONFIG_FILE="$(mktemp)"
  cat > "$SRC_CONFIG_FILE" <<EOF
{
  "ImageRepository": {
    "ImageIdentifier": "${ECR_API_URI}:latest",
    "ImageRepositoryType": "ECR",
    "ImageConfiguration": {
      "Port": "4000",
      "RuntimeEnvironmentVariables": {"NODE_ENV": "production"},
      "RuntimeEnvironmentSecrets": {"DATABASE_URL": "${DB_PARAM_ARN}", "JWT_ACCESS_SECRET": "${JWT_PARAM_ARN}"}
    }
  },
  "AuthenticationConfiguration": {"AccessRoleArn": "${ECR_ACCESS_ROLE_ARN}"},
  "AutoDeploymentsEnabled": false
}
EOF
  API_SERVICE_ARN="$(aws_ apprunner create-service \
    --service-name "${PROJECT}-api" \
    --source-configuration "file://${SRC_CONFIG_FILE}" \
    --instance-configuration "{\"InstanceRoleArn\": \"${INSTANCE_ROLE_ARN}\"}" \
    --network-configuration "{\"EgressConfiguration\": {\"EgressType\": \"VPC\", \"VpcConnectorArn\": \"${CONNECTOR_ARN}\"}}" \
    --query 'Service.ServiceArn' --output text)"
  log "Waiting for ${PROJECT}-api to become RUNNING (first create is slow)..."
else
  log "Redeploying ${PROJECT}-api"
  aws_ apprunner start-deployment --service-arn "$API_SERVICE_ARN" >/dev/null
fi
require_apprunner_running "$API_SERVICE_ARN" "${PROJECT}-api"
API_URL="https://$(aws_ apprunner describe-service --service-arn "$API_SERVICE_ARN" --query 'Service.ServiceUrl' --output text)"
log "api service URL: $API_URL"

# ============================================================
# Build + push web image (VITE_API_URL baked in at build time)
# ============================================================
log "Building web image (VITE_API_URL=${API_URL})"
docker build -f apps/web/Dockerfile --build-arg VITE_API_URL="${API_URL}" -t "${ECR_WEB_URI}:latest" -t "${ECR_WEB_URI}:${GIT_SHA}" .
docker push "${ECR_WEB_URI}:latest"
docker push "${ECR_WEB_URI}:${GIT_SHA}"

# ============================================================
# web App Runner service
# ============================================================
WEB_SERVICE_INFO="$(apprunner_find_service "${PROJECT}-web")"
WEB_SERVICE_ARN="$(awk '{print $1}' <<< "$WEB_SERVICE_INFO")"
WEB_SERVICE_STATUS="$(awk '{print $2}' <<< "$WEB_SERVICE_INFO")"
if [ "$WEB_SERVICE_ARN" = "None" ] || [ -z "$WEB_SERVICE_ARN" ]; then
  WEB_SERVICE_ARN=""
elif ! ensure_apprunner_service_usable "$WEB_SERVICE_ARN" "${PROJECT}-web" "$WEB_SERVICE_STATUS"; then
  WEB_SERVICE_ARN=""
fi

if [ -z "$WEB_SERVICE_ARN" ]; then
  log "Creating App Runner service ${PROJECT}-web"
  WEB_SERVICE_ARN="$(aws_ apprunner create-service \
    --service-name "${PROJECT}-web" \
    --source-configuration "{\"ImageRepository\": {\"ImageIdentifier\": \"${ECR_WEB_URI}:latest\", \"ImageRepositoryType\": \"ECR\", \"ImageConfiguration\": {\"Port\": \"3000\", \"RuntimeEnvironmentVariables\": {\"NODE_ENV\": \"production\"}}}, \"AuthenticationConfiguration\": {\"AccessRoleArn\": \"${ECR_ACCESS_ROLE_ARN}\"}, \"AutoDeploymentsEnabled\": false}" \
    --query 'Service.ServiceArn' --output text)"
  log "Waiting for ${PROJECT}-web to become RUNNING (first create is slow)..."
else
  log "Redeploying ${PROJECT}-web"
  aws_ apprunner start-deployment --service-arn "$WEB_SERVICE_ARN" >/dev/null
fi
require_apprunner_running "$WEB_SERVICE_ARN" "${PROJECT}-web"
WEB_URL="https://$(aws_ apprunner describe-service --service-arn "$WEB_SERVICE_ARN" --query 'Service.ServiceUrl' --output text)"
log "web service URL: $WEB_URL"

# ============================================================
# Point the api service's WEB_ORIGIN at the web service (needed for CORS + the
# refresh-token cookie) — only update if it's missing or stale, to avoid an
# unnecessary redeploy on every run.
# ============================================================
CURRENT_WEB_ORIGIN="$(aws_ apprunner describe-service --service-arn "$API_SERVICE_ARN" \
  --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables.WEB_ORIGIN' --output text)"
if [ "$CURRENT_WEB_ORIGIN" != "$WEB_URL" ]; then
  log "Setting api's WEB_ORIGIN to $WEB_URL and redeploying"
  aws_ apprunner update-service --service-arn "$API_SERVICE_ARN" --source-configuration "{
    \"ImageRepository\": {
      \"ImageIdentifier\": \"${ECR_API_URI}:latest\",
      \"ImageRepositoryType\": \"ECR\",
      \"ImageConfiguration\": {
        \"Port\": \"4000\",
        \"RuntimeEnvironmentVariables\": {\"NODE_ENV\": \"production\", \"WEB_ORIGIN\": \"${WEB_URL}\"},
        \"RuntimeEnvironmentSecrets\": {\"DATABASE_URL\": \"${DB_PARAM_ARN}\", \"JWT_ACCESS_SECRET\": \"${JWT_PARAM_ARN}\"}
      }
    },
    \"AuthenticationConfiguration\": {\"AccessRoleArn\": \"${ECR_ACCESS_ROLE_ARN}\"},
    \"AutoDeploymentsEnabled\": false
  }" >/dev/null
  require_apprunner_running "$API_SERVICE_ARN" "${PROJECT}-api"
fi

echo ""
echo "============================================================"
echo " api: $API_URL"
echo " web: $WEB_URL"
echo "============================================================"
