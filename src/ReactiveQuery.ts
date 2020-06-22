import * as firebase from 'firebase';
import {computed, getCurrentInstance, onUnmounted, shallowRef, watchEffect,} from '@vue/composition-api';
import {SubDocumentManager} from './SubDocumentManager';
import {DisconnectHandle, isFunction, Optional, Supplier} from './utils';
import DocumentData = firebase.firestore.DocumentData;
import CollectionReference = firebase.firestore.CollectionReference;
import Query = firebase.firestore.Query;
import QuerySnapshot = firebase.firestore.QuerySnapshot;
import QueryDocumentSnapshot = firebase.firestore.QueryDocumentSnapshot;

type QueryLike =
  | CollectionReference
  | Query
  | Readonly<CollectionReference>
  | Readonly<Query>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isQueryLike(obj: any) {
  // TODO in future could use isReadonly and toRaw to unwrap a proxy - not released yet
  // For now check for onSnapshot method
  return 'undefined' !== typeof obj['onSnapshot'];
}

export class QueryItem {
  readonly data: DocumentData;
  readonly disconnect: DisconnectHandle;

  private _subDocumentManager = new SubDocumentManager();

  constructor(
    readonly snapshot: QueryDocumentSnapshot,
    private readonly subscribe: boolean
  ) {
    this.data = this.snapshot.data();
    this._subDocumentManager.enhanceSubDocuments(this.data, this.subscribe);
    this.disconnect = () => {
      this._subDocumentManager.removeAndDisconnectAll();
    };
  }
}


export function reactiveQuery(
  queryRefSupplier: Supplier<Optional<QueryLike>>,
  subscribe = false
) {

  const loadingRef = shallowRef(false);
  const snapshotRef = shallowRef<Optional<QuerySnapshot>>(undefined);
  const itemsRef = shallowRef<QueryItem[]>([]);
  const errorRef = shallowRef<Optional<Error>>(undefined);


  // Create a computed property, if the supplier is reactive then when it changes this will also change
  const queryRefTrigger = computed(() => {
    try {
      const queryRef = queryRefSupplier();
      if (isQueryLike(queryRef)) return queryRef;
      console.log('WARNING: Not a query reference');
    } catch (err) {
      console.log(`Error getting query ref - using null - ${err}`);
    }
    return null;
  });

  // Keep a reference to an unsubscription handler if a subscription
  let unsubscribe: null | (() => void) = null;

  const purgeExistingItems = () => {
    itemsRef.value.forEach((i: QueryItem) => i.disconnect());
  };

  const resetFields = ({
                         error,
                         items,
                         snapshot,
                         loading,
                       }: {
    error?: Error;
    loading?: boolean;
    snapshot?: QuerySnapshot;
    items?: QueryItem[];
  }) => {
    errorRef.value = error;
    itemsRef.value = items ? items : [];
    snapshotRef.value = snapshot;
    loadingRef.value = loading === void 0 ? false : loading;
  };

  // Error Handler
  const onError = (err: Error) => {
    // Purge any existing sub docs
    purgeExistingItems();
    resetFields({error: err});
  };
  // Snapshot Handler
  const onSnapshot = (snapshot: QuerySnapshot) => {
    purgeExistingItems(); // Purge any existing sub docs
    const items = snapshot.docs.map(qds => {
      return new QueryItem(qds, subscribe);
    });
    resetFields({snapshot, items});
  };

  // Watch the trigger for changes to the QueryReference we are tracking
  let disconnected = false;
  const stopHandle = watchEffect( () => {
    if (disconnected) return;

      const queryRef = queryRefTrigger.value;

      // Reset the values
      purgeExistingItems(); // Purge any existing sub docs
      resetFields({});

      // If no Query then quit
      if (!queryRef) return;

      // We have a QueryReference - start loading
      loadingRef.value = true;

      if (subscribe) {
        unsubscribe = queryRef.onSnapshot(onSnapshot, onError);
      } else {
        queryRef.get().then(onSnapshot).catch(onError);
      }

      // Loading will be stopped in the handler
    },
    { flush: 'sync' }
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

    disconnected = true;
    purgeExistingItems(); // Purge any existing sub docs
    resetFields({});
  };

  // If this is called during setup then it will automatically disconnect on unmount
  if (getCurrentInstance()) {
    onUnmounted(disconnect);
  }

  ///////////////////
  // Exposed values

  const loading = computed(() => loadingRef.value)
  const snapshot = computed(() => snapshotRef.value)
  const items = computed(() => itemsRef.value)
  const error = computed(() => errorRef.value)

  return {
    get loading() { return loading; },
    get snapshot() { return snapshot; },
    get items() { return items; },
    get error() { return error; },
    get disconnected() { return disconnected;},
    disconnect
  }
}

export type ReactiveQuery = ReturnType<typeof reactiveQuery>

export function queryOnce(query: QueryLike): ReactiveQuery;
export function queryOnce(querySupplier: Supplier<QueryLike>): ReactiveQuery;
// eslint-disable @typescript-eslint/no-explicit-any
export function queryOnce(query: any): ReactiveQuery {
  const querySupplier = isFunction(query) ? query : () => query;
  return reactiveQuery(querySupplier, false);
}

export function watchQuery(query: QueryLike): ReactiveQuery;
export function watchQuery(
  querySupplier: Supplier<QueryLike>
): ReactiveQuery;
// eslint-disable @typescript-eslint/no-explicit-any
export function watchQuery(query: any): ReactiveQuery {
  const querySupplier = isFunction(query) ? query : () => query;
  return reactiveQuery(querySupplier, true);
}
