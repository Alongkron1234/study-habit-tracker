/**
 * routes.js — แผนผัง Route และการจำกัดสิทธิ์ (Role-based access mapping)
 */

export const ROUTE_PERMISSIONS = {
  '/templates': ['pm'],
  '/goals': ['participant'],
  '/goals/:id': ['participant'],
};

/**
 * ตรวจสอบว่า role ที่กำหนดมีสิทธิ์เข้าถึง pathname หรือไม่
 * @param {string} pathname
 * @param {string} role
 * @returns {boolean}
 */
export function isRouteAllowedForRole(pathname, role) {
  if (!pathname || pathname === '/' || pathname === '/dashboard') {
    return true;
  }

  // Exact match
  if (ROUTE_PERMISSIONS[pathname]) {
    return ROUTE_PERMISSIONS[pathname].includes(role);
  }

  // Match dynamic routes like /goals/123
  for (const [pattern, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pattern.includes(':')) {
      const regex = new RegExp(`^${pattern.replace(/:[^\s/]+/g, '([^/]+)')}$`);
      if (regex.test(pathname)) {
        return roles.includes(role);
      }
    }
  }

  // เส้นทางทั่วไปที่ไม่มีการระบุสิทธิ์เฉพาะ
  return true;
}
