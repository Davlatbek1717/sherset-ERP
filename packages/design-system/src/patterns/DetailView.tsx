'use client';

import * as React from 'react';
import { Container } from '../layout/Container.tsx';
import { PageHeader } from '../layout/PageHeader.tsx';
import { Breadcrumb, type BreadcrumbItem } from '../navigation/Breadcrumb.tsx';

export interface DetailViewProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  status?: React.ReactNode;
  testId?: string;
}

export const DetailView = React.forwardRef<HTMLDivElement, DetailViewProps>(
  (
    { className, title, subtitle, breadcrumbs, actions, status, children, testId, ...props },
    ref,
  ) => (
    <Container className="py-4 space-y-4" {...(testId ? { 'data-test-id': testId } : {})}>
      <div ref={ref} className={className} {...props}>
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <span data-test-id="entity-name">{title}</span>
              {status}
            </div>
          }
          subtitle={subtitle}
          breadcrumbs={breadcrumbs ? <Breadcrumb items={breadcrumbs} /> : undefined}
          actions={actions}
        />
        <div className="space-y-4">{children}</div>
      </div>
    </Container>
  ),
);
DetailView.displayName = 'DetailView';
