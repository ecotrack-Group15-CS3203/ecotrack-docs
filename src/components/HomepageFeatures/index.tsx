import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Hyper-Local Incident Reporting',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Citizens submit geo-tagged, photo-verified environmental hazard reports
        via mobile app. Incidents are pinned to an interactive map and routed to
        the correct local organization for verification and action.
      </>
    ),
  },
  {
    title: 'Multi-Tenant Data Isolation',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Each environmental organization operates in a secure tenant workspace.
        PostgreSQL Row-Level Security (RLS) enforces strict data isolation at the
        database engine level — no cross-tenant data leaks.
      </>
    ),
  },
  {
    title: 'Configurable Cleanup Workflows',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Organization admins define custom incident status flows (e.g.,{' '}
        <em>Reported → Verified → Cleanup Scheduled → Resolved</em>) via a
        dynamic order-index system — no backend code changes required.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
