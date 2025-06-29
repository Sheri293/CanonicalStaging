import LandingPageAuditor from "../src/core/LandingPageAuditor.js";
import fs from "fs-extra";

async function createBaselines(url) {
  console.log("Testing LandingPageAuditor:", typeof LandingPageAuditor);

  if (typeof LandingPageAuditor !== "function") {
    console.error("LandingPageAuditor is not a constructor function");
    console.error("Type:", typeof LandingPageAuditor);
    console.error("Content:", LandingPageAuditor);
    process.exit(1);
  }

  const auditor = new LandingPageAuditor({
    includeVisualRegression: true,
    includeStructureComparison: true,
    visualRegression: {
      threshold: 0.05,
      captureViewports: [
        { width: 1920, height: 1080, name: "desktop" },
        { width: 768, height: 1024, name: "tablet" },
        { width: 375, height: 667, name: "mobile" },
      ],
    },
    htmlStructure: {
      styleAnalysis: true,
    },
  });

  await auditor.initialize();
  console.log(`Creating baselines for: ${url}`);

  const results = await auditor.auditEngine.createBaselines(url);
  console.log(` Baselines created for ${results.length} pages`);

  await auditor.cleanup();
}

async function clearBaselines() {
  console.log("Clearing all baselines...");
  await fs.remove("./baselines");
  console.log(" All baselines cleared");
}

async function clearVisualBaselines() {
  console.log("Clearing visual baselines...");
  await fs.remove("./baselines/screenshots");
  console.log(" Visual baselines cleared");
}

async function clearStructureBaselines() {
  console.log("Clearing structure baselines...");
  await fs.remove("./baselines/structure");
  console.log(" Structure baselines cleared");
}

async function listBaselines() {
  try {
    const visualFiles = await fs
      .readdir("./baselines/screenshots")
      .catch(() => []);
    const structureFiles = await fs
      .readdir("./baselines/structure")
      .catch(() => []);

    console.log(`Visual baselines: ${visualFiles.length} files`);
    console.log(`Structure baselines: ${structureFiles.length} files`);

    if (visualFiles.length > 0) {
      console.log("\nVisual baseline files:");
      visualFiles.forEach((file) => console.log(`  - ${file}`));
    }

    if (structureFiles.length > 0) {
      console.log("\nStructure baseline files:");
      structureFiles.forEach((file) => console.log(`  - ${file}`));
    }
  } catch (error) {
    console.log("No baselines found");
  }
}

function showUsage() {
  console.log("Usage:");
  console.log("  node script/baseline-manager.js create <url>");
  console.log("  node script/baseline-manager.js clear");
  console.log("  node script/baseline-manager.js clear-visual");
  console.log("  node script/baseline-manager.js clear-structure");
  console.log("  node script/baseline-manager.js list");
}

const command = process.argv[2];
const url = process.argv[3];

(async () => {
  try {
    switch (command) {
      case "create":
        if (!url) {
          console.log("Error: URL required");
          showUsage();
          process.exit(1);
        }
        await createBaselines(url);
        break;

      case "clear":
        await clearBaselines();
        break;

      case "clear-visual":
        await clearVisualBaselines();
        break;

      case "clear-structure":
        await clearStructureBaselines();
        break;

      case "list":
        await listBaselines();
        break;

      default:
        showUsage();
        break;
    }
  } catch (error) {
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
})();
