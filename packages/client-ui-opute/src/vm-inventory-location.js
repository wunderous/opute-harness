/**
 * Overlay still publishes `key === kind` so older DSH assemblers that throw on
 * mismatch keep working. Current DSH stamps the engine-owned kind itself.
 */

export const OPUTE_VM_INVENTORY_KIND = 'opute-vm-inventory'

export function oputeVmInventoryLocationData(state) {
  if (!state || !Array.isArray(state.vms) || state.vms.length === 0) return null
  return {
    kind: 'turn',
    turn: state.turn,
    key: OPUTE_VM_INVENTORY_KIND,
    value: { vms: state.vms },
  }
}
