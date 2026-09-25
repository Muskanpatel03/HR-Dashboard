import React from 'react';
import { C, FONT_MONO } from '../config';

export default function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderTop: `3px solid ${accent || C.ink}` }} className="p-3.5 rounded">
      <div style={{ color: C.ink2, fontSize: 11.5 }}>{label}</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 24, color: C.ink, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ color: C.ink2, fontSize: 11, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
