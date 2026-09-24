// Sidebar for the React Redux docs on the combined Redux docs site
// (https://redux.js.org/react-redux). The site's docs plugin instance for this
// library reads this file. It has no imports because it is loaded from a copy of
// this folder inside the redux repo's website build.

const sidebars = {
  docs: [
    {
      type: 'category',
      label: 'Introduction',
      collapsed: false,
      items: [
        'introduction/getting-started',
        'introduction/why-use-react-redux',
      ],
    },
    {
      type: 'category',
      label: 'Tutorials',
      collapsed: false,
      items: [
        {
          type: 'link',
          label: 'Quick Start',
          href: '/tutorials/quick-start',
        },
      ],
    },
    {
      type: 'category',
      label: 'Using React Redux',
      collapsed: false,
      items: ['using-react-redux/accessing-store'],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['api/provider', 'api/hooks', 'api/batch'],
    },
    {
      type: 'category',
      label: 'Legacy: connect',
      collapsed: true,
      items: [
        'api/connect',
        'using-react-redux/connect-mapstate',
        'using-react-redux/connect-mapdispatch',
        'using-react-redux/usage-with-typescript',
        'tutorials/connect',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        {
          type: 'link',
          label: 'Troubleshooting',
          href: '/usage/troubleshooting',
        },
      ],
    },
  ],
}

export default sidebars
