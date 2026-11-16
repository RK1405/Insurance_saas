import crypto from 'node:crypto';
import { hashPassword } from '../auth.js';
import { tx } from '../db.js';
import { checkCompliance } from '../engine/compliance.js';
import { defaultRetailConfig, defaultSettings, defaultSmeConfig } from '../engine/defaults.js';

function makeCode(name) {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4).padEnd(3, 'X');
  return `${letters}${crypto.randomInt(10, 99)}`;
}

/** Creates an organisation, its first admin user and published starter products for the chosen lines. */
export async function createOrganisation({ orgName, orgType, name, email, password, lines, code }) {
  const passwordHash = await hashPassword(password);
  return tx(async (db) => {
    let orgCode = code;
    for (let i = 0; !orgCode && i < 10; i += 1) {
      const candidate = makeCode(orgName);
      const { rows } = await db.query('select 1 from organizations where code = $1', [candidate]);
      if (!rows.length) orgCode = candidate;
    }
    const { rows: [org] } = await db.query(
      'insert into organizations (name, code, org_type, settings) values ($1,$2,$3,$4) returning *',
      [orgName, orgCode, orgType, defaultSettings()],
    );
    const { rows: [user] } = await db.query(
      `insert into users (org_id, email, name, password_hash, role, lines, preferences)
       values ($1,$2,$3,$4,'admin',$5,$6) returning *`,
      [org.id, email, name, passwordHash, lines, { defaultLine: lines[0], theme: 'system' }],
    );
    const starters = [
      { line: 'retail', code: 'FAMILY-SHIELD', name: 'Family Shield Health Plan', config: defaultRetailConfig() },
      { line: 'sme', code: 'BIZ-CARE', name: 'BizCare Group Health', config: defaultSmeConfig() },
    ];
    for (const s of starters) {
      await db.query(
        `insert into products (org_id, code, name, line, status, config, compliance, created_by, published_at)
         values ($1,$2,$3,$4,'published',$5,$6,$7, now())`,
        [org.id, s.code, s.name, s.line, s.config, checkCompliance(s.config, s.line), user.id],
      );
    }
    return { org, user };
  });
}
