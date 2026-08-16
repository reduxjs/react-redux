/** @type {import('next').NextConfig} */
const nextConfig = {
  // This example exists only to verify that the published react-redux tarball
  // installs, resolves, and builds under the Next.js App Router. It has no
  // ESLint dependency or config of its own -- it used to silently inherit the
  // repo root `.eslintrc.json`, which was removed when the repo moved to
  // oxlint. Linting the example adds nothing to what it is here to prove.
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
