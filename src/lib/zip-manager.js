import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

export const createExportPackage = async (projects, legacyMediaFiles) => {
  const zip = new JSZip();

  // projects is an array of { filename, xmlString, mediaFiles }
  // OR for backward compatibility, handle (xmlString, mediaFiles)

  let items = [];
  if (typeof projects === 'string') {
      items.push({ filename: 'project.xml', xmlString: projects, mediaFiles: legacyMediaFiles });
  } else {
      items = projects;
  }

  for (const project of items) {
      zip.file(project.filename, project.xmlString);

      if (project.mediaFiles && project.mediaFiles.length > 0) {
        // mediaFiles should have 'path' relative to zip root or 'filename'
        // We assume mediaFiles are { path: string, blob: Blob }
        // path should be fully qualified like "media/Project1/img.png"
        for (const file of project.mediaFiles) {
             const filePath = file.path || `media/${file.filename}`;
             zip.file(filePath, file.blob);
        }
      }
  }

  return await zip.generateAsync({ type: "blob" });
};

export const readImportPackage = async (zipBlob) => {
  const zip = await JSZip.loadAsync(zipBlob);

  const xmls = [];
  const mediaFiles = [];

  // Iterate all files in the ZIP
  const entries = [];
  zip.forEach((relativePath, file) => {
      entries.push({ relativePath, file });
  });

  for (const { relativePath, file } of entries) {
      if (file.dir) continue;

      // Check if XML
      if (relativePath.toLowerCase().endsWith('.xml')) {
          const content = await file.async("string");
          xmls.push({
              path: relativePath,
              content: content
          });
      } else {
          // Treat everything else as potential media
          // We load blob lazily or eagerly? Eagerly is fine for reasonable sizes.
          // But for large ZIPs, maybe lazy? Let's stick to eager for now as per current design.
          const blob = await file.async("blob");
          mediaFiles.push({
              path: relativePath,
              blob: blob
          });
      }
  }

  if (xmls.length === 0) {
      throw new Error("Invalid package: No XML project files found.");
  }

  return { xmls, mediaFiles };
};
