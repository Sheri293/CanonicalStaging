import LandingPageAuditor from "../src/core/LandingPageAuditor.js";

function detectH1toH3Manipulation(auditResults) {
  const manipulations = [];

  auditResults.forEach((result) => {
    if (!result.htmlStructure) return;

    const structureChanges =
      result.htmlStructure.structureComparison?.headingChanges
        ?.hierarchyChanges || [];
    const stylingChanges =
      result.htmlStructure.stylingComparison?.suspiciousChanges || [];

    const h1ToH3Changes = structureChanges.filter(
      (change) => change.from === "H1" && change.to === "H3"
    );

    if (h1ToH3Changes.length > 0) {
      h1ToH3Changes.forEach((structuralChange) => {
        const compensatingStyling = stylingChanges.find(
          (styleChange) =>
            styleChange.selector.includes("h3") &&
            styleChange.reason === "heading_impersonation"
        );

        manipulations.push({
          url: result.url,
          type: "h1_to_h3_with_styling",
          structuralChange,
          compensatingStyling,
          severity: compensatingStyling ? "CRITICAL" : "HIGH",
          description: compensatingStyling
            ? "H1 changed to H3 but styled to look like H1 - SEO manipulation detected!"
            : "H1 changed to H3 - potential SEO impact",
        });
      });
    }
  });

  return manipulations;
}

function detectAllHeadingManipulations(auditResults) {
  const manipulations = [];

  auditResults.forEach((result) => {
    if (!result.htmlStructure?.structureComparison?.headingChanges) return;

    const headingChanges =
      result.htmlStructure.structureComparison.headingChanges.hierarchyChanges;
    const stylingChanges =
      result.htmlStructure.stylingComparison?.suspiciousChanges || [];

    headingChanges.forEach((structuralChange) => {
      if (
        structuralChange.impact === "critical" ||
        structuralChange.impact === "warning"
      ) {
        const compensatingStyling = stylingChanges.find((styleChange) =>
          styleChange.selector.includes(structuralChange.to.toLowerCase())
        );

        manipulations.push({
          url: result.url,
          type: "heading_hierarchy_change",
          from: structuralChange.from,
          to: structuralChange.to,
          text: structuralChange.text,
          impact: structuralChange.impact,
          hasCompensation: !!compensatingStyling,
          structuralChange,
          compensatingStyling,
          severity:
            structuralChange.impact === "critical" ? "CRITICAL" : "HIGH",
        });
      }
    });
  });

  return manipulations;
}

function detectVisualChanges(auditResults) {
  const changes = [];

  auditResults.forEach((result) => {
    if (!result.visualRegression?.visualChanges) return;

    result.visualRegression.visualChanges.forEach((change) => {
      changes.push({
        url: result.url,
        element: change.element,
        viewport: change.viewport,
        diffPercentage: change.diffPercentage,
        severity:
          change.diffPercentage > 50
            ? "MAJOR"
            : change.diffPercentage > 20
              ? "MODERATE"
              : "MINOR",
        diffPath: change.diffPath,
      });
    });
  });

  return changes;
}

function generateManipulationReport(auditResults) {
  const report = {
    timestamp: new Date().toISOString(),
    totalUrls: auditResults.length,
    h1ToH3Manipulations: detectH1toH3Manipulation(auditResults),
    allHeadingManipulations: detectAllHeadingManipulations(auditResults),
    visualChanges: detectVisualChanges(auditResults),
    summary: {},
  };

  report.summary = {
    criticalManipulations: report.h1ToH3Manipulations.filter(
      (m) => m.severity === "CRITICAL"
    ).length,
    totalHeadingChanges: report.allHeadingManipulations.length,
    majorVisualChanges: report.visualChanges.filter(
      (c) => c.severity === "MAJOR"
    ).length,
    urlsWithManipulation: new Set([
      ...report.h1ToH3Manipulations.map((m) => m.url),
      ...report.allHeadingManipulations
        .filter((m) => m.hasCompensation)
        .map((m) => m.url),
    ]).size,
  };

  return report;
}

function printManipulationReport(report) {
  console.log("\n SEO MANIPULATION DETECTION REPORT");
  console.log("=====================================");
  console.log(`Generated: ${new Date(report.timestamp).toLocaleString()}`);
  console.log(`Total URLs Analyzed: ${report.totalUrls}`);
  console.log(`URLs with Manipulation: ${report.summary.urlsWithManipulation}`);

  if (report.summary.criticalManipulations > 0) {
    console.log("\n CRITICAL MANIPULATIONS DETECTED:");
    console.log(
      `Found ${report.summary.criticalManipulations} H1→H3 changes with styling compensation`
    );

    report.h1ToH3Manipulations
      .filter((m) => m.severity === "CRITICAL")
      .forEach((m) => {
        console.log(`\n   URL: ${m.url}`);
        console.log(`   Text: "${m.structuralChange.text}"`);
        console.log(
          `   Change: ${m.structuralChange.from} → ${m.structuralChange.to}`
        );
        console.log(`STYLED TO HIDE CHANGE - This is SEO manipulation!`);
      });
  }

  if (report.summary.totalHeadingChanges > 0) {
    console.log(
      `\n HEADING STRUCTURE CHANGES: ${report.summary.totalHeadingChanges}`
    );

    const headingsByImpact = report.allHeadingManipulations.reduce((acc, m) => {
      acc[m.impact] = (acc[m.impact] || 0) + 1;
      return acc;
    }, {});

    Object.entries(headingsByImpact).forEach(([impact, count]) => {
      console.log(`   ${impact.toUpperCase()}: ${count} changes`);
    });
  }

  if (report.summary.majorVisualChanges > 0) {
    console.log(
      `\n  MAJOR VISUAL CHANGES: ${report.summary.majorVisualChanges}`
    );

    report.visualChanges
      .filter((c) => c.severity === "MAJOR")
      .slice(0, 5)
      .forEach((change) => {
        console.log(
          `   ${change.url} - ${
            change.element
          } (${change.diffPercentage.toFixed(1)}% different)`
        );
      });
  }

  if (
    report.summary.criticalManipulations === 0 &&
    report.summary.totalHeadingChanges === 0 &&
    report.summary.majorVisualChanges === 0
  ) {
    console.log("\n No SEO manipulations or major changes detected");
  }

  console.log("\n=====================================\n");
}

async function runManipulationDetection(landingUrl) {
  const auditor = new LandingPageAuditor({
    includeVisualRegression: true,
    includeStructureComparison: true,
  });

  await auditor.initialize();

  console.log("Running SEO manipulation detection...");

  const results = await auditor.auditLandingPage(landingUrl, {
    maxDepth: 2,
    maxUrls: 50,
    includeVisualRegression: true,
    includeStructureComparison: true,
  });

  const report = generateManipulationReport(results.auditResults || []);
  printManipulationReport(report);

  await auditor.cleanup();

  return report;
}

export {
  detectH1toH3Manipulation,
  detectAllHeadingManipulations,
  detectVisualChanges,
  generateManipulationReport,
  printManipulationReport,
  runManipulationDetection,
};
