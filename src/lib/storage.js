import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8.0.0/+esm';

const DB_NAME = 'exercise_app';
const STORE_KV = 'kv';
const STORE_MEDIA = 'media';

let dbPromise;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_KV)) {
            db.createObjectStore(STORE_KV);
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
            db.createObjectStore(STORE_MEDIA);
        }
      },
    });
  }
  return dbPromise;
};

export const getAppState = async () => {
  return (await getDB()).get(STORE_KV, 'app_state');
};

export const saveAppState = async (state) => {
  return (await getDB()).put(STORE_KV, state, 'app_state');
};

// OPFS Support
const getOpfsRoot = async () => {
  if (navigator.storage && navigator.storage.getDirectory) {
    return navigator.storage.getDirectory();
  }
  return null;
};

export const saveMedia = async (projectId, assetId, filename, blob) => {
  const root = await getOpfsRoot();
  if (root) {
    // Try OPFS
    try {
      const projectDir = await root.getDirectoryHandle(projectId, { create: true });
      const assetDir = await projectDir.getDirectoryHandle(assetId, { create: true });
      const fileHandle = await assetDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { path: `opfs://${projectId}/${assetId}/${filename}`, type: 'OPFS' };
    } catch (e) {
      console.warn("OPFS write failed, falling back to IDB", e);
    }
  }

  // Fallback to IndexedDB
  const path = `media/${projectId}/${assetId}/${filename}`;
  await (await getDB()).put(STORE_MEDIA, blob, path);
  return { path: path, type: 'IDB' };
};

export const getMediaBlob = async (path) => {
    return loadMedia(path);
}

export const loadMedia = async (path) => {
  if (!path) return null;

  if (path.startsWith('opfs://')) {
    const root = await getOpfsRoot();
    if (root) {
      try {
        const parts = path.replace('opfs://', '').split('/');
        let dir = root;
        // Navigate directories
        for (let i = 0; i < parts.length - 1; i++) {
          dir = await dir.getDirectoryHandle(parts[i]);
        }
        // Get file
        const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
        return await fileHandle.getFile();
      } catch (e) {
        console.error("OPFS read failed", e);
        return null;
      }
    }
  } else {
    // IDB (path is the key)
    return (await getDB()).get(STORE_MEDIA, path);
  }
  return null;
};

export const deleteMedia = async (path) => {
   if (!path) return;

   if (path.startsWith('opfs://')) {
        // Full recursive deletion for OPFS is tricky without a dedicated walker,
        // but typically we delete the specific file.
        // For simplicity in this plan, we will just try to delete the file.
        // In a real app we might want to clean up empty directories.
        try {
             const root = await getOpfsRoot();
             if (root) {
                 const parts = path.replace('opfs://', '').split('/');
                 let dir = root;
                 for (let i = 0; i < parts.length - 1; i++) {
                     dir = await dir.getDirectoryHandle(parts[i]);
                 }
                 await dir.removeEntry(parts[parts.length - 1]);
             }
        } catch(e) {
            console.warn("Failed to delete from OPFS", e);
        }
   } else {
       await (await getDB()).delete(STORE_MEDIA, path);
   }
}
