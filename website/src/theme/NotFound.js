/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import React, { useEffect } from 'react'
import Layout from '@theme/Layout'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

function NotFound() {
  const context = useDocusaurusContext()
  const { siteConfig = {} } = context
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://buttons.github.io/buttons.js";
    script.async = true;
    document.body.appendChild(script);
  }, [])

  const getTrackingScript = () => {
    if (!siteConfig.themeConfig || !siteConfig.themeConfig.googleAnalytics || !siteConfig.themeConfig.googleAnalytics.gaTrackingId) {
      return null;
    }
    
    return {__html:`
      ga('create', "${siteConfig.gaTrackingId}");
      ga('send', {
        hitType: 'event',
        eventCategory: '404 Response',
        eventAction: window.location.href,
        eventLabel: document.referrer
      });`
    }
  };
  const trackingScript = getTrackingScript();
 
  return (
    <Layout title="Page Not Found">
      {trackingScript && <script dangerouslySetInnerHTML={trackingScript}/>}
      <div className="error-page">
        <div className="error-message">
          <div className="error-message-container container">
            <span>404 </span>
            <p>Page Not Found.</p>
            <a href="/">Return to the front page</a>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default NotFound;
