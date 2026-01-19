import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

export const createExportPackage = async (xmlString, mediaFiles) => {
  const zip = new JSZip();
  zip.file("project.xml", xmlString);

  if (mediaFiles && mediaFiles.length > 0) {
    const mediaFolder = zip.folder("media");
    for (const file of mediaFiles) {
        // file: { filename: string, blob: Blob }
        mediaFolder.file(file.filename, file.blob);
    }
  }

  return await zip.generateAsync({ type: "blob" });
};

export const readImportPackage = async (zipBlob) => {
  const zip = await JSZip.loadAsync(zipBlob);

  const projectXmlFile = zip.file("project.xml");
  if (!projectXmlFile) {
      throw new Error("Invalid package: missing project.xml");
  }

  const xmlString = await projectXmlFile.async("string");

  const mediaFiles = [];
  const mediaFolder = zip.folder("media");
  if (mediaFolder) {
      // Iterate over files in media folder
      // JSZip iteration is a bit specific
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

  return { xml: xmlString, mediaFiles };
};
