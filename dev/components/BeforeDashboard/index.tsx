import { Banner } from '@payloadcms/ui/elements/Banner'
import React from 'react'

import { SeedButton } from './SeedButton'
import './index.scss'

const baseClass = 'before-dashboard'

const BeforeDashboard: React.FC = () => {
  return (
    <div className={baseClass}>
      <Banner className={`${baseClass}__banner`} type="success">
        <h4>Page tree playground</h4>
      </Banner>
      <ul className={`${baseClass}__instructions`}>
        <li>
          <SeedButton /> to rebuild the same 30-page tree in Pages, Tabbed Pages, and Localized Pages
          with EN, FR, and DE titles. This replaces all pages and version history in these three
          playground collections.
        </li>
      </ul>
    </div>
  )
}

export default BeforeDashboard
