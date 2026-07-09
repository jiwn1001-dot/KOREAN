const fs = require('fs');
let code = fs.readFileSync('src/app/admin/page.js', 'utf8');

const boundaryCode = `
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <div style={{padding:'20px', background:'red', color:'white'}}><h2>UI Error!</h2><pre>{this.state.error.toString()}</pre></div>;
    }
    return this.props.children;
  }
}
`;

if (!code.includes('class ErrorBoundary')) {
  code = code.replace("import { useState, useEffect, useCallback } from 'react';", "import React, { useState, useEffect, useCallback } from 'react';\n" + boundaryCode);
  
  code = code.replace("const renderResearch = () => {", "const renderResearch = () => { return <ErrorBoundary><RenderResearchInner /></ErrorBoundary>; };\n  const RenderResearchInner = () => {");
  
  code = code.replace("const renderBlueprints = () => (", "const renderBlueprints = () => <ErrorBoundary><RenderBlueprintsInner /></ErrorBoundary>;\n  const RenderBlueprintsInner = () => (");
  
  fs.writeFileSync('src/app/admin/page.js', code, 'utf8');
  console.log('ErrorBoundary injected');
} else {
  console.log('Already injected');
}
