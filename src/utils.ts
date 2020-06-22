/**
 * Track a set of document references
 */
import * as firebase from 'firebase';
import DocumentReference = firebase.firestore.DocumentReference;

export type DisconnectHandle = () => void;
export type Supplier<T> = () => T | null;
export type Optional<T> = T | undefined;

export function walkDocumentReferences(
  obj: any,
  visitor: (obj: DocumentReference, path: string[]) => void,
  path: string[] = ['$']
) {
  if (obj instanceof DocumentReference) {
    visitor(obj, path);
  }
  // Only continue traversing if likely to be a nested object or array
  else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; ++i)
      walkDocumentReferences(obj[i], visitor, [...path, `[${i}]`]);
  } else if (typeof obj === 'object' && typeof obj !== 'function') {
    for (const name in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, name)) continue;
      walkDocumentReferences(obj[name], visitor, [...path, name]);
    }
  }
}

export function isFunction(functionToCheck: any) {
  return (
    functionToCheck && {}.toString.call(functionToCheck) === '[object Function]'
  );
}

