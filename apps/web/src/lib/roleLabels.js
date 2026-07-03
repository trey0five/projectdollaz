// Membership roles are SHOWN to users as their briefing VIEW — one vocabulary with
// the Scope × Lens views (LensControls' LENS_META). The underlying RBAC enum stays
// owner|accountant|viewer (permissions unchanged); only the label the user reads is
// mapped here: Owner→Leadership, Accountant→Finance, Viewer→Board.
export const MEMBER_ROLE_LABEL = {
  owner: 'Leadership',
  accountant: 'Finance',
  viewer: 'Board',
}

export function memberRoleLabel(role) {
  return MEMBER_ROLE_LABEL[role] ?? role
}
