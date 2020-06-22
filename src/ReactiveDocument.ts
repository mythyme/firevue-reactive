import * as firebase from 'firebase';
import {
  computed,
  getCurrentInstance,
  onUnmounted,
  shallowRef,
  watchEffect,
} from '@vue/composition-api';
import {isFunction, Optional, Supplier} from './utils';
import {SubDocumentManager} from './SubDocumentManager';
import DocumentReference = firebase.firestore.DocumentReference;
import DocumentSnapshot = firebase.firestore.DocumentSnapshot;
import DocumentData = firebase.firestore.DocumentData;

type DocumentReferenceLike = DocumentReference | Readonly<DocumentReference>;

export function reactiveDocument(
  docRefSupplier: Supplier<Optional<DocumentReferenceLike>>,
  subscribe = false
) {
  const loadingRef = shallowRef(false);
  const snapshotRef = shallowRef<Optional<DocumentSnapshot>>(undefined);
  const dataRef = shallowRef<Optional<DocumentData>>(undefined);
  const errorRef = shallowRef<Optional<Error>>(undefined);

  // Create a computed property, if the supplier is reactive then when it changes this will also change
  const docRefTrigger = computed(() => {
    try {
      const docRef = docRefSupplier();
      if (docRef instanceof DocumentReference) return docRef;
      console.warn('WARNING: Not a document reference');
    } catch (err) {
      console.debug('Error getting doc ref - using null');
    }
    return null;
  });

  const subDocumentManager = new SubDocumentManager();

  // Keep a reference to an unsubscription handler if a subscription
  let unsubscribe: null | (() => void) = null;

  const resetFields = ({
    error,
    data,
    snapshot,
    loading,
  }: {
    error?: Error;
    loading?: boolean;
    snapshot?: DocumentSnapshot;
    data?: DocumentData;
  }) => {
    errorRef.value = error;
    dataRef.value = data;
    snapshotRef.value = snapshot;
    loadingRef.value = loading === void 0 ? false : loading;
  };

  // Error Handler
  const onError = (err: Error) => {
    // Purge any existing sub docs
    subDocumentManager.removeAndDisconnectAll();
    resetFields({error: err});
  };
  // Snapshot Handler
  const onSnapshot = (snapshot: DocumentSnapshot) => {
    // Purge any existing sub docs
    subDocumentManager.removeAndDisconnectAll();

    const data = snapshot.data();
    if (data) subDocumentManager.enhanceSubDocuments(data, subscribe);
    resetFields({snapshot, data});
  };

  // Watch the trigger for changes to the DocumentReference we are tracking
  let disconnected = false;
  const stopHandle = watchEffect(
    () => {
      if (disconnected) return;

      const docRef = docRefTrigger.value as DocumentReference;

      // Reset the values and remove any sub-docs
      subDocumentManager.removeAndDisconnectAll();
      resetFields({});

      // If no DocumentReference then quit
      if (!docRef) return;

      // We have a DocumentReference - start loading
      loadingRef.value = true;

      if (subscribe) {
        unsubscribe = docRef.onSnapshot(onSnapshot, onError);
      } else {
        docRef.get().then(onSnapshot).catch(onError);
      }
    },
    {flush: 'sync'}
  );

  // Set up the Disconnect handling
  const disconnect = () => {
    if (disconnected) return;

    if (stopHandle) {
      stopHandle();
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    // Purge any existing sub docs
    subDocumentManager.removeAndDisconnectAll();

    disconnected = true;
    resetFields({});
  };

  // If this is called during setup then it will automatically disconnect on unmount
  if (getCurrentInstance()) {
    onUnmounted(disconnect);
  }

  ///////////////////
  // Exposed values

  const loading = computed(() => loadingRef.value);
  const snapshot = computed(() => snapshotRef.value);
  const data = computed(() => dataRef.value);
  const error = computed(() => errorRef.value);

  return {
    loading,
    snapshot,
    data,
    error,
    get disconnected() {
      return disconnected;
    },
    disconnect,
  };
}

export type ReactiveDocument = ReturnType<typeof reactiveDocument>;

export function getOnce(docRef: DocumentReferenceLike): ReactiveDocument;
export function getOnce(
  docRefSupplier: Supplier<DocumentReferenceLike>
): ReactiveDocument;
// eslint-disable @typescript-eslint/no-explicit-any
export function getOnce(docRef: any): ReactiveDocument {
  const docRefSupplier = isFunction(docRef) ? docRef : () => docRef;
  return reactiveDocument(docRefSupplier, false);
}

export function watchDocument(docRef: DocumentReferenceLike): ReactiveDocument;
export function watchDocument(
  docRefSupplier: Supplier<DocumentReferenceLike>
): ReactiveDocument;
// eslint-disable @typescript-eslint/no-explicit-any
export function watchDocument(docRef: any): ReactiveDocument {
  const docRefSupplier = isFunction(docRef) ? docRef : () => docRef;
  return reactiveDocument(docRefSupplier, true);
}
