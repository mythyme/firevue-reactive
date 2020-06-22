import * as firebase from 'firebase';
import {Optional, walkDocumentReferences} from './utils';
import {reactiveDocument, ReactiveDocument} from './ReactiveDocument';
import DocumentReference = firebase.firestore.DocumentReference;
import DocumentData = firebase.firestore.DocumentData;

const SUB_DOCUMENT_PROPERTY_NAME = 'target';

export type Targeted = {target: ReactiveDocument};

export function hasTarget(
  dref?: DocumentReference
): dref is DocumentReference & Targeted {
  return (
    !!dref &&
    Object.prototype.hasOwnProperty.call(dref, SUB_DOCUMENT_PROPERTY_NAME)
  );
}

interface SubDocumentCacheRecord {
  propertyPath: string[];
  documentReference: DocumentReference;
}

export class SubDocumentManager {
  private records: SubDocumentCacheRecord[] = [];

  enhanceSubDocuments(data: DocumentData, subscribe: boolean) {
    walkDocumentReferences(data, (ref, path) => this.add(path, ref, subscribe));
  }

  add(
    propertyPath: string[],
    documentReference: DocumentReference,
    subscribe: boolean
  ) {
    let subDoc: Optional<ReactiveDocument>;
    const lazySubDoc = () => {
      if (!subDoc) {
        // Create the reactive document
        subDoc = reactiveDocument(() => documentReference, subscribe);
      }
      return subDoc;
    };

    Object.defineProperty(documentReference, SUB_DOCUMENT_PROPERTY_NAME, {
      enumerable: false,
      get: function () {
        return lazySubDoc();
      },
    });

    this.records.push({propertyPath, documentReference});
  }

  removeAndDisconnectAll() {
    while (this.records.length > 0) {
      const rec = this.records.pop();

      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      const rd = rec.documentReference[SUB_DOCUMENT_PROPERTY_NAME] as Optional<
        ReactiveDocument
      >;

      rd?.disconnect();
    }
  }
}
