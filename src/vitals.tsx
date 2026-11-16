'use client';

import { useReportWebVitals } from 'next/web-vitals.js';

type DL = { dataLayer?: unknown[] };
type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

// Module-level so the callback never changes: useReportWebVitals registers again
// whenever its callback changes, which would report every metric twice.
function report(m: Metric) {
  const w = window as unknown as DL;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({
    event: 'web_vitals',
    metric_name: m.name,
    metric_value: m.name === 'CLS' ? Math.round(m.value * 1000) / 1000 : Math.round(m.value),
    metric_rating: (m as { rating?: string }).rating,
    metric_id: m.id,
    page: window.location.pathname,
  });
}

/** Push each Core Web Vitals metric to the dataLayer as a `web_vitals` event. */
export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
