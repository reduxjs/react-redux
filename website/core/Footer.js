/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const React = require("react");

class Footer extends React.Component {
  docUrl(doc, language) {
    const baseUrl = this.props.config.baseUrl;
    return `${baseUrl}${language ? `${language}/` : ""}${doc}`;
  }

  pageUrl(doc, language) {
    const baseUrl = this.props.config.baseUrl;
    return baseUrl + (language ? `${language}/` : "") + doc;
  }

  render() {
    return (
      <footer className="nav-footer" id="footer">
        <section className="sitemap">
          <a href={this.props.config.baseUrl} className="nav-home">
            {this.props.config.footerIcon && (
              <img
                src={this.props.config.baseUrl + this.props.config.footerIcon}
                alt={this.props.config.title}
                width="66"
                height="58"
              />
            )}
          </a>
          <div>
            <h5>Docs</h5>
            <a href={this.docUrl("introduction/quick-start")}>Introduction</a>
            <a
              href={this.docUrl(
                "using-react-redux/connect-mapstate"
              )}
            >
              Using React-Redux
            </a>
            <a href={this.docUrl("api")}>API Reference</a>
            <a href={this.docUrl("troubleshooting")}>Guides</a>
          </div>
          <div>
            <h5>Community</h5>
            <a
              href="http://stackoverflow.com/questions/tagged/react-redux"
              target="_blank"
              rel="noreferrer noopener"
            >
              Stack Overflow
            </a>
            <a href="https://discord.gg/0ZcbPKXt5bZ6au5t">
              Discord
            </a>
          </div>
          <div>
            <h5>More</h5>
            <a href="https://github.com/reduxjs/react-redux/">GitHub</a>
            <a
              className="github-button"
              href={this.props.config.repoUrl}
              data-icon="octicon-star"
              data-count-href="/reduxjs/react-redux/stargazers"
              data-show-count="true"
              data-count-aria-label="# stargazers on GitHub"
              aria-label="Star this project on GitHub"
            >
              Star
            </a>
          </div>
        </section>
        <section className="copyright">
          {this.props.config.copyright}<br />
          Some icons copyright <a
            href="https://fontawesome.com/license/free"
            style={{color : "white"}}
          >
            Font Awesome
          </a>  and <a
          href="https://thenounproject.com"
          style={{color : "white"}}
        >
          Noun Project
        </a> (<a
          href="https://thenounproject.com/term/certificate/1945625/"
          style={{color : "white"}}
        >
          prasong tadoungsorn
        </a>, <a
          href="https://thenounproject.com/term/box/1664404/"
          style={{color : "white"}}
        >
          Vladimir Belochkin
        </a>, <a
          href="https://thenounproject.com/term/rocket/1245262/"
          style={{color : "white"}}
        >
          Atif Arshad
        </a>)
        </section>
      </footer>
    );
  }
}

module.exports = Footer;
