#!/usr/bin/env bash
# Deploy del backend: push + actualizar el deployment estable (NUNCA create-deployment).
# Uso: scripts/deploy.sh "v2 descripción"
set -e
cd "$(dirname "$0")/.."
DEPLOYMENT_ID="AKfycbydf1RDfDnIPZs2uZaiXyZ7uPsmw67gUbQ1C2-NRcZkmg9OO4ZMQe45AyMTc75k0nEv"
clasp push -f
clasp update-deployment -d "${1:-deploy}" "$DEPLOYMENT_ID"
echo "Listo. URL estable: $(cat .exec_url)"
