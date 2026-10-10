const ts = require('typescript');
const crypto = require('crypto');

module.exports = {
  getCacheKey(fileData, filePath) {
    return crypto.createHash('md5').update(fileData).update(filePath).update('v4').digest('hex');
  },
  process(sourceText, sourcePath) {
    let cleaned = sourceText.replace(/import\.meta\.url/g, '""');
    if (sourcePath.includes('en-us.js')) {
      cleaned = cleaned.replace(
        "import patterns from 'hyphen/patterns/en-us.js';",
        "import patternsObj from 'hyphen/patterns/en-us.js'; const patterns = patternsObj.default || patternsObj;",
      );
    }
    const result = ts.transpileModule(cleaned, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        allowJs: true,
        esModuleInterop: true,
      },
      fileName: sourcePath,
    });
    return { code: result.outputText };
  },
};
