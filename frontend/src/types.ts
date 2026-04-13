export type RoleCode = 'SUPER_ADMIN' | 'ADMIN' | 'DELIVERY';

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  roleCode: RoleCode;
  mustChangePassword?: boolean;
};
