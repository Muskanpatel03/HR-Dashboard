// frontend/src/components/RecruitmentAnalysis.jsx
// Recruitment Analysis tab: candidate-level hiring table whose retention /
// early-exit columns are linked to the Separation records (and checked against
// the Joined tab totals).
import React, { useEffect, useState } from 'react';
import api from '../api';
import ModuleView from './ModuleView';
import { C, RECRUITMENT_ANALYSIS_CONFIG } from '../config';
import { setLinked } from '../linkedData';

// Pass the same props you give ModuleView for the other Recruitment tabs
// (editable, creatable, canDelete, companyId, ...).
export default function RecruitmentAnalysis(props) {
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState({ separations: 0, joinedTab: 0 });

  useEffect(() => {
    let alive = true;
    const params = props.companyId && props.companyId !== 'all' ? { company: props.companyId } : undefined;
    Promise.allSettled([
      api.get('/separation', { params }),
      api.get('/hiring', { params }),
    ]).then(([sep, hire]) => {
      if (!alive) return;
      const sepRows = sep.status === 'fulfilled' ? sep.value.data.records || [] : [];
      const hireRows = hire.status === 'fulfilled' ? hire.value.data.records || [] : [];
      setLinked('separation', sepRows);
      setLinked('hiring', hireRows);
      setInfo({
        separations: sepRows.length,
        joinedTab: hireRows.reduce((s, r) => s + (Number(r.joined) || 0), 0),
      });
      setReady(true);
    });
    return () => { alive = false; };
  }, [props.companyId]);

  if (!ready) return <div style={{ color: C.ink2, fontSize: 13 }}>Loading linked data…</div>;

  return (
    <div className="space-y-3">
      <div style={{ color: C.ink2, fontSize: 12.5 }}>
        Retention and early-exit columns are matched by candidate name against{' '}
        <b>{info.separations}</b> Separation record{info.separations !== 1 ? 's' : ''}; Joined tab total:{' '}
        <b>{info.joinedTab}</b>.
      </div>
      <ModuleView {...props} config={RECRUITMENT_ANALYSIS_CONFIG} />
    </div>
  );
}