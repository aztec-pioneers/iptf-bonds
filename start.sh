#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
aztec_log_path="$repo_root/.aztec-local-network.log"
aztec_process_id=""
started_aztec_locally=false

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

http_endpoint_responds() {
  local url="$1"
  curl --silent --output /dev/null --max-time 2 "$url"
}

wait_for_http_endpoint() {
  local url="$1"
  local label="$2"
  local attempts=0
  local max_attempts=120

  until http_endpoint_responds "$url"; do
    attempts=$((attempts + 1))
    if (( attempts >= max_attempts )); then
      echo "Timed out waiting for $label at $url" >&2
      echo "Aztec logs: $aztec_log_path" >&2
      exit 1
    fi

    sleep 2
  done

  echo "$label is ready at $url"
}

cleanup() {
  local script_started_aztec="$started_aztec_locally"
  local has_aztec_process_id="${aztec_process_id:-}"

  if [[ "$script_started_aztec" == true && -n "$has_aztec_process_id" ]]; then
    local aztec_process_is_running=false
    if kill -0 "$aztec_process_id" >/dev/null 2>&1; then
      aztec_process_is_running=true
    fi

    if [[ "$aztec_process_is_running" == true ]]; then
      echo
      echo "Stopping Aztec local network..."
      kill "$aztec_process_id" >/dev/null 2>&1 || true
      wait "$aztec_process_id" 2>/dev/null || true
    fi
  fi
}

trap cleanup EXIT INT TERM

main() {
  require_command pnpm
  require_command aztec
  require_command curl

  local l1_rpc_url="http://localhost:8545"
  local l2_node_url="http://localhost:8080"

  cd "$repo_root"

  echo "Installing workspace dependencies..."
  pnpm install

  echo "Building Noir contracts and generated bindings..."
  (
    cd "$repo_root/packages/contracts"
    pnpm build
  )

  local l1_rpc_is_ready=false
  if http_endpoint_responds "$l1_rpc_url"; then
    l1_rpc_is_ready=true
  fi

  local l2_node_is_ready=false
  if http_endpoint_responds "$l2_node_url"; then
    l2_node_is_ready=true
  fi

  local existing_local_network_is_ready=false
  if [[ "$l1_rpc_is_ready" == true && "$l2_node_is_ready" == true ]]; then
    existing_local_network_is_ready=true
  fi

  local network_state_is_inconsistent=false
  if [[ "$l1_rpc_is_ready" != "$l2_node_is_ready" ]]; then
    network_state_is_inconsistent=true
  fi

  if [[ "$network_state_is_inconsistent" == true ]]; then
    echo "Detected a partial local Aztec stack." >&2
    echo "Expected both $l1_rpc_url and $l2_node_url to be available, or neither." >&2
    echo "Stop the existing process on ports 8545/8080 or start the full local network, then retry." >&2
    exit 1
  fi

  if [[ "$existing_local_network_is_ready" == true ]]; then
    echo "Reusing the Aztec local network already running on localhost."
  else
    echo "Starting Aztec local network..."
    : > "$aztec_log_path"
    aztec start --local-network > "$aztec_log_path" 2>&1 &
    aztec_process_id="$!"
    started_aztec_locally=true

    echo "Aztec logs: $aztec_log_path"
    wait_for_http_endpoint "$l1_rpc_url" "L1 RPC"
    wait_for_http_endpoint "$l2_node_url" "L2 node"
  fi

  echo "Deploying Sponsored FPC and stablecoin..."
  (
    cd "$repo_root/packages/cli"
    pnpm setup:deploy
  )

  echo "Starting frontend on http://localhost:3000"
  local shutdown_message="Press Ctrl+C to stop the frontend."
  if [[ "$started_aztec_locally" == true ]]; then
    shutdown_message="Press Ctrl+C to stop the frontend and the local Aztec network."
  fi

  echo "$shutdown_message"
  (
    cd "$repo_root/packages/frontend"
    pnpm dev
  )
}

main "$@"
