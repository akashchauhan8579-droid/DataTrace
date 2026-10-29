'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { GraphSkeleton } from './GraphSkeleton';

const GraphView = dynamic(() => import('./GraphView'), {
  ssr: false,
  loading: () => <GraphSkeleton />,
});

export default function EntityGraphPage() {
  const params = useParams();
  const caseId = params.id as string;

  return <GraphView caseId={caseId} />;
}
