/**
  * Copyright (c) 2017-present, Facebook, Inc.
  *
  * This source code is licensed under the MIT license found in the
  * LICENSE file in the root directory of this source tree.
  */

 const React = require('react');

 const CompLibrary = require('../../core/CompLibrary');

 const Container = CompLibrary.Container;

 const CWD = process.cwd();

 const siteConfig = require(`${CWD}/siteConfig.js`);
 const versions = require(`${CWD}/versions.json`);

 const versionToReleaseTags = {
   '5.x': '5.0.0',
   '6.x': '6.0.0',
   '7.x': '7.0.0-beta.0'
 }

 function Versions() {
   const latestVersion = versions[0];
   const repoUrl = `https://github.com/${siteConfig.organizationName}/${
     siteConfig.projectName
   }`;
   const releaseTagUrl = version => versionToReleaseTags.hasOwnProperty(version) ? `${repoUrl}/releases/tag/v${versionToReleaseTags[version]}` : `${repoUrl}/releases/tag/v${version}`
   return (
     <div className="docMainWrapper wrapper">
       <Container className="mainContainer versionsContainer">
         <div className="post">
           <header className="postHeader">
             <h1>{siteConfig.title} Versions</h1>
           </header>
           <p>New versions of this project are released every so often.</p>
           <h3 id="latest">Current version (Stable)</h3>
           <table className="versions">
             <tbody>
               <tr>
                 <th>{latestVersion}</th>
                 <td>
                   <a href="/introduction/quick-start">Documentation</a>
                 </td>
                 <td>
                   <a href={releaseTagUrl(latestVersion)}>Release Notes</a>
                 </td>
               </tr>
             </tbody>
           </table>
           <p>
             This is the version that is configured automatically when you first
             install this project.
           </p>
           {
             !!siteConfig.nextVersion && (<React.Fragment>
<h3 id="rc">Pre-release versions</h3>
           <table className="versions">
             <tbody>
               <tr>
                 <th>{siteConfig.nextVersion}</th>
                 <td>
                   <a href={`/next/introduction/quick-start`}>Documentation</a>
                 </td>
                 <td>
                   <a href={releaseTagUrl(siteConfig.nextVersion)}>Release Notes</a>
                 </td>
               </tr>
             </tbody>
           </table>
             </React.Fragment>)
           }
           <h3 id="archive">Past Versions</h3>
           <table className="versions">
             <tbody>
               {versions.map(
                 version =>
                   version !== latestVersion && (
                     <tr key={`version-${version}`}>
                       <th>{version}</th>
                       <td>
                         <a href={`${version}/introduction/quick-start`}>Documentation</a>
                       </td>
                       <td>
                         <a href={releaseTagUrl(version)}>Release Notes</a>
                       </td>
                     </tr>
                   ),
               )}
             </tbody>
           </table>
           <p>
             You can find past versions of this project on{' '}
             <a href={repoUrl}>GitHub</a>.
           </p>
         </div>
       </Container>
     </div>
   );
 }

 module.exports = Versions;