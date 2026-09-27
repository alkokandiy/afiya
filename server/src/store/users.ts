import { ROLES, type Role, type Script } from "../../../shared/types.js";
import type { DB } from "../db.js";

export interface User {
  id: number;
  firstName: string;
  username: string | null;
  name: string;
  phone: string;
  address: string;
  script: Script;
  roles: Role[];
}

interface UserRow {
  id: number;
  first_name: string;
  username: string | null;
  name: string;
  phone: string;
  address: string;
  script: Script;
  roles: string;
}

const parseRoles = (value: string): Role[] => ROLES.filter((role) => value.split(",").includes(role));

const toUser = (row: UserRow): User => ({
  id: row.id,
  firstName: row.first_name,
  username: row.username,
  name: row.name,
  phone: row.phone,
  address: row.address,
  script: row.script,
  roles: parseRoles(row.roles),
});

export class UserStore {
  constructor(private readonly db: DB) {}

  /** Records a visit from Telegram and returns the stored user. */
  touch(id: number, firstName: string, username: string | null): User {
    this.db
      .prepare(
        `INSERT INTO users (id, first_name, username) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           first_name = excluded.first_name, username = excluded.username, last_seen_at = datetime('now')`,
      )
      .run(id, firstName, username);
    return this.get(id)!;
  }

  get(id: number): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row && toUser(row);
  }

  saveProfile(id: number, profile: { name: string; phone: string; address?: string }): void {
    this.db
      .prepare("UPDATE users SET name = ?, phone = ?, address = COALESCE(?, address) WHERE id = ?")
      .run(profile.name, profile.phone, profile.address ?? null, id);
  }

  setScript(id: number, script: Script): void {
    this.db.prepare("UPDATE users SET script = ? WHERE id = ?").run(script, id);
  }

  setRoles(id: number, roles: Role[]): boolean {
    return this.db.prepare("UPDATE users SET roles = ? WHERE id = ?").run(roles.join(","), id).changes > 0;
  }

  /** Users with the role in the database (owners from config are added by the caller). */
  withRole(role: Role): User[] {
    const rows = this.db
      .prepare("SELECT * FROM users WHERE ',' || roles || ',' LIKE ?")
      .all(`%,${role},%`) as UserRow[];
    return rows.map(toUser);
  }

  /** Staff first, then the most recently seen people — the list the admin picks new staff from. */
  listForStaffPicker(limit: number): User[] {
    const rows = this.db
      .prepare("SELECT * FROM users ORDER BY roles = '' , last_seen_at DESC LIMIT ?")
      .all(limit) as UserRow[];
    return rows.map(toUser);
  }
}
