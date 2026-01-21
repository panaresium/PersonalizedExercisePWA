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

  const xmlFiles = [];

  // Find all .xml files in the root
  zip.forEach((relativePath, file) => {
      if (!file.dir && relativePath.toLowerCase().endsWith('.xml') && !relativePath.includes('/')) {
          xmlFiles.push(file);
      }
  });

  if (xmlFiles.length === 0) {
      throw new Error("Invalid package: missing project XML files");
  }

  const xmlStrings = await Promise.all(xmlFiles.map(f => f.async("string")));

  const mediaFiles = [];
  const mediaFolder = zip.folder("media");
  if (mediaFolder) {
      const files = [];
      mediaFolder.forEach((relativePath, file) => {
          files.push({ path: relativePath, file });
      });

      for (const { path, file } of files) {
          if (!file.dir) {
             const blob = await file.async("blob");
             mediaFiles.push({ filename: path, blob });
          }
      }
  }

  return { xmls: xmlStrings, mediaFiles };
};
