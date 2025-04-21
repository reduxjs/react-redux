module.exports = {
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
        'tutorials/quick-start',
        'tutorials/typescript-quick-start',
        'tutorials/connect',
      ],
    },
    {
      type: 'category',
      label: 'Using React Redux',
      collapsed: false,
      items: [
        'using-react-redux/usage-with-typescript',
        'using-react-redux/connect-mapstate',
        'using-react-redux/connect-mapdispatch',
        'using-react-redux/accessing-store',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['api/provider', 'api/hooks', 'api/connect', 'api/batch'],
    },
    {
      type: 'category',
      label: 'Guides',
      items: ['troubleshooting'],
    },
  ],
}
