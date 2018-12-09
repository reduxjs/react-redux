/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const React = require("react");

const CompLibrary = require("../../core/CompLibrary.js");

const {MarkdownBlock, GridBlock, Container} = CompLibrary; /* Used to read markdown */

const siteConfig = require(`${process.cwd()}/siteConfig.js`);

function docUrl(doc, language) {
  return `${siteConfig.baseUrl}${language ? `${language}/` : ""}${doc}`;
}

function imgUrl(img) {
  return `${siteConfig.baseUrl}img/${img}`;
}
class Button extends React.Component {
  render() {
    return (
      <div className="pluginWrapper buttonWrapper">
        <a className="button hero" href={this.props.href} target={this.props.target}>
          {this.props.children}
        </a>
      </div>
    );
  }
}

Button.defaultProps = {
  target: "_self"
};

const SplashContainer = props => (
  <div className="homeContainer">
    <div className="homeSplashFade">
      <div className="wrapper homeWrapper">{props.children}</div>
    </div>
  </div>
);

const Logo = props => (
  <div className="projectLogo">
    <img src={props.img_src} alt="Project Logo" />
  </div>
);

const ProjectTitle = () => (
  <React.Fragment>
    <div style={{display : "flex", justifyContent : "center", alignItems : "center"}}>
      <img src={"img/redux.svg"} alt="Redux logo" width={100} height={100}/>
      <h1 className="projectTitle">{siteConfig.title}</h1>
    </div>

    <h2 style={{marginTop : "0.5em"}}>
      Official React bindings for Redux
    </h2>
    </React.Fragment>
);

const PromoSection = props => (
  <div className="section promoSection">
    <div className="promoRow">
      <div className="pluginRowBlock">{props.children}</div>
    </div>
  </div>
);

class HomeSplash extends React.Component {
  render() {
    const language = this.props.language || "";
    return (
      <SplashContainer>
        <div className="inner">
          <ProjectTitle />
          <PromoSection>
            <Button href={docUrl("introduction/quick-start", language)}>
              Get Started
            </Button>
          </PromoSection>
        </div>
      </SplashContainer>
    );
  }
}

const Block = props => (
  <Container
    id={props.id}
    background={props.background}
    className={props.className}
  >
    <GridBlock align="center" contents={props.children} layout={props.layout}/>
  </Container>
);

const FeaturesTop = props => (
  <Block layout="fourColumn" className="featureBlock">
    {/*[
      {
        content: "Redux helps you write applications that **behave consistently**, run in different environments (client, server, and native), and are **easy to test**.",
        //image: imgUrl('icon/time.png'),
        image : imgUrl("noun_Check_1870817.svg"),
        imageAlign: 'top',
        title: "Predictable"
      },
    ]*/}
  </Block>
);

class Index extends React.Component {
  render() {
    const language = this.props.language || "";

    return (
      <div>
        <HomeSplash language={language} />
        <div className="mainContainer">
        </div>
      </div>
    );
  }
}

module.exports = Index;
