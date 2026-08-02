import { PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

export function validateComponentRegistration({ message, rootCtx: { connectionRegistry, diagnostics } }) {
  const { agentID, data: { hash } } = message
  const connection = connectionRegistry.get(agentID)

  diagnostics.require(
    connection,
    PRECONDITION_REQUIRED,
    'Connection missing for component registration',
    { agentID }
  )

  diagnostics.require(
    hash,
    PRECONDITION_REQUIRED,
    'Component hash is required for registration',
    { agentID }
  )

  return { hash, agentID }
}
