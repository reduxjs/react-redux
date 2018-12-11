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
    {[
      {
        content: "React-Redux is maintained by the Redux team, and **kept up-to-date with the latest APIs from Redux and React**.",
        image : imgUrl("noun_Certificate_1945625.svg"),
        imageAlign: 'top',
        title: "Official"
      },
      {
        content: "**Designed to work with React's component model**.  You define how to extract the values your component needs from Redux, and your component receives them as props.",
        image : imgUrl("noun_Check_1870817.svg"),
        imageAlign: 'top',
        title: "Predictable"
      },
      {
        content: "Creates wrapper components that **manage the store interaction logic for you**, so you don't have to write it yourself.",
        image : imgUrl("noun_Box_1664404.svg"),
        imageAlign: 'top',
        title: "Encapsulated"
      },
      {
        content: "Automatically implements **complex performance optimizations**, so that your own component only re-renders when the data it needs has actually changed.",
        image : imgUrl("noun_Rocket_1245262.svg"),
        imageAlign: 'top',
        title: "Optimized"
      },
    ]}
  </Block>
);

const OtherLibraries = props => (
  <Block layout="twoColumn" className="libBlock">
    {[
      {
        content: "A predictable state container for JavaScript applications",
        title: "[Redux ![link2](img/external-link-square-alt-solid.svg)](https://react-redux.js.org) "
      },
      {
        content: "A simple batteries-included toolset to make using Redux easier",
        title: "[Redux Starter Kit ![link2](img/external-link-square-alt-solid.svg)](https://redux-starter-kit.js.org)"
      },
    ]}
  </Block>
);


class Index extends React.Component {
  render() {
    const language = this.props.language || "";

    return (
      <div>
        <HomeSplash language={language} />
        <div className="mainContainer">
          <div className="productShowcaseSection">
            <Container background="light">
              <FeaturesTop />
            </Container>
            <Container>
              <h2 style={{marginTop : "0.5em"}}>
                Other Libraries from the Redux Team
              </h2>
              <OtherLibraries/>
            </Container>
          </div>
        </div>
      </div>
    );
  }
}

module.exports = Index;
