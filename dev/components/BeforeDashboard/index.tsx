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
          Use the clean <strong>pages</strong> collection as-is, or <SeedButton /> with nested
          orderable pages for drag-and-drop testing.
        </li>
      </ul>
    </div>
  )
}

export default BeforeDashboard
