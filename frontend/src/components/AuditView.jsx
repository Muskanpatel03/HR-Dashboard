import React, { useEffect, useState } from 'react';
import api from '../api';
import { C, FONT_MONO } from '../config';

export default function AuditView() {
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/audit').then((res) => setAudit(res.data.audit)).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: C.paper, borderBottom: `1px solid ${C.line}` }}>
            {['Time', 'User', 'Role', 'Module', 'Action', 'Detail'].map((h) => (
              <th key={h} style={{ color: C.ink2, fontSize: 11.5 }} className="text-left px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: C.ink2, fontSize: 13 }}>Loading…</td></tr>}
          {!loading && audit.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: C.ink2, fontSize: 13 }}>No activity recorded yet.</td></tr>
          )}
          {!loading && audit.map((a) => (
            <tr key={a.id} style={{ borderBottom: `1px solid ${C.line}` }}>
              <td style={{ fontFamily: FONT_MONO, fontSize: 11.5 }} className="px-3 py-2">{new Date(a.time).toLocaleString('en-IN')}</td>
              <td className="px-3 py-2">{a.user_name}</td>
              <td className="px-3 py-2" style={{ color: C.ink2 }}>{a.role}</td>
              <td className="px-3 py-2">{a.module}</td>
              <td className="px-3 py-2">
                <span
                  style={{
                    background: a.action === 'Deleted' ? '#F5DEDA' : a.action === 'Created' ? '#DCEAE4' : '#EDEAE0',
                    color: a.action === 'Deleted' ? C.rust : a.action === 'Created' ? C.moss : C.ink2,
                    fontSize: 11,
                  }}
                  className="px-2 py-0.5 rounded"
                >
                  {a.action}
                </span>
              </td>
              <td className="px-3 py-2" style={{ color: C.ink2, fontSize: 12.5 }}>{a.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
