//*********************************************************************************************************
//ixDbEz -     IndexedDB EZ is a js wrapper for IndexedDB providing rapid client-side development
//             of IndexedDB databases.
//
// Copyright (C) 2012 - Jake Drew
// Dual licensed under the MIT and GPL licenses.
//  - http://www.opensource.org/licenses/mit-license.php
//  - http://www.gnu.org/copyleft/gpl.html
//
//Created By - Jake Drew
//Version -    1.0, 07/16/2012
//Version -    2.0, 08/11/2012
//                  1.  Added Support for ixDbSync.
//                  2.  Made all error messages consistent, fixed error event capture.
//                  3.  Updated all data change functions to detect the IndexedDB API versionchange
//                      transaction and re-schedule themselves for the oncomplete event in the event that
//                      they are called during the version change transaction.
//                  4.  Added clear() function for the IndexedDB API clear method.
//                  5.  Added keyRange variable to getCursor() function to support IDBKeyRanges.
//                  6.  Added objectContainsProperty method to identify, if an object contains a property
//                      prior to adding the property to the object (used in ixDbEz and ixDbEzSync)
//                  7.  indexName was added to getCursor() function to provide support for opening index
//                      based cursors.
//*********************************************************************************************************
var ixDbEz = (function () {
    //Populate the window.indexedDB variables with the appropriate browser specific instance.
    window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
    window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.msIDBTransaction;
    window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.msIDBKeyRange;

    var ixDb; //The current ixdb database instance being accessed in all functions below.
    var ixDbRequest; //The current ixdb request instance being accessed in all functions below.
    var ixDbVersionTansaction; //Holds a reference to a versionchange transaction object anytime a version change is in process.
    var ixDbVersionRequest;
    var ixDbSyncFlag;
    //*********************************************************************************************************
    //Function StartDB - Open or create the requested database and populate the variable ixDb with the new IndexedDB instance.
    //          dbName - Name of the IndexedDB database to open or create
    //       dbVersion - MUST be a valid integer. If not, the database is given a version number = 1.
    //         ixdbDDL - javascript var that contains a function with all the IndexedDB's valid ixDbEz DDL calls (see usage example)
    //       onSuccess - (optional) callback function to execute if function successful.
    //         onError - (optional) callback function to execute if function fails.
    //        ixDbSync - (optional) if true, fires ixDbSync events on all datachanges.
    //                   !!!only use the ixDbSync option for ixDbSync.js data server-side synchronization!!!
    //*********************************************************************************************************
    function StartDB_(dbName, dbVersion, ixdbDDL, onSuccess, onError, useIxDbSync) {
        //Check to see if we have a browser that supports IndexedDB
        if (window.indexedDB) {

            //Trigger data synchronization hooks, if ixDbSync is being used.
            ixDbSyncFlag = useIxDbSync;
            //Open or create the requested IndexedDB Database
            ixDbRequest = window.indexedDB.open(dbName, dbVersion);

            var newVersion = parseInt(dbVersion || 1);
            newVersion = isNaN(newVersion) || newVersion == null ? 1 : newVersion;

            ixDbRequest.onsuccess = function (e) {

                ixDb = ixDbRequest.result || e.result;  // FF4 requires e.result.

                //Check to see if a database upgrade is required.
                //This logic should work with Chrome until they catch up with Firefox and support onupgradeneeded event.
                //Also works on older browsers builds that still support setVersion
                if (typeof ixDb.setVersion === "function") {

                    var oldVersion = parseInt(ixDb.version || -1001);
                    oldVersion = isNaN(oldVersion) || oldVersion == null ? -1001 : oldVersion;

                    if (oldVersion < newVersion) {
                        ixDbVersionRequest = ixDb.setVersion(newVersion);
                        //Get a reference to the version request from the old setVersion method.
                        //ixDbVersionRequest = verRequest; //.result || e.currentTarget.result;

                        ixDbVersionRequest.onerror = ixDbEz.onerror;

                        ixDbVersionRequest.onsuccess = function (e) {
                            ixDbVersionTansaction = e.result || e.currentTarget.result;
                            //log successful database creation
                            console.log('ixDbEz: Created Database: ' + dbName + ',  Version: ' + newVersion + '.');
                            //Create database structure using function provided by the user.
                            ixdbDDL();
                            //Create any required ixDbSync database structures
                            if(ixDbSyncFlag) {
                                ixDbSync.syncDDL();
                            }

                            //must clear version request so getCursor callback works right after db creation
                            ixDbVersionRequest = undefined;
                            //destroy the version trasaction variable (since version change transactions lock the database)
                            ixDbVersionTansaction = undefined;
                        }
                    }
                    else {
                        //log successful database open
                        console.log('ixDbEz: Opened Database: ' + dbName + ',  Version: ' + newVersion + '.')
                    }
                }

                //execute onsuccess function, if one was provided
                if(typeof onSuccess === 'function') {
                    onSuccess();
                }

            };

            ixDbRequest.onerror = function (e) {
                logError(e, onError, ixDbVersionTansaction);
                console.log('ixDbEz Error: Opened Database: ' + dbName + ',  Version: ' + newVersion + ' failed.')
            };

            //The onupgradeneeded event is not yet supported by Chrome and requires a hook in the onsuccess event above.
            ixDbRequest.onupgradeneeded = function (e) {
                //FF uses this event to fire DDL function for upgrades.  All browsers will eventually use this method. Per - W3C Working Draft 24 May 2012
                ixDb = ixDbRequest.result || e.currentTarget.result;
                //Get a reference to the version transaction via the onupgradeneeded event (e)
                ixDbVersionTansaction = e.transaction || e.currentTarget.transaction;

                //Clear out upgrade flags as soon as the upgrade is completed.
                ixDbVersionTansaction.oncomplete = function (e) {
                    //must clear version request so getCursor callback works right after db creation
                    ixDbVersionRequest = undefined;
                    //destroy the version trasaction variable (since version change transactions lock the database)
                    ixDbVersionTansaction = undefined;
                };

                //log successful database creation
                console.log('ixDbEz: Created Database: ' + dbName + ',  Version: ' + newVersion + '.');
                //Create database using function provided by the user.
                ixdbDDL();
                //Create any required ixDbSync database structures
                if(ixDbSyncFlag) {
                    ixDbSync.syncDDL();
                }
            };
        }
    }

    //*********************************************************************************************************
    //Function CreateObjStore - Create IndexedDB object store (similar to a table)
    //       objectStoreName - Name of the Object Store / Table "MyOsName"
    //                 pkName - Keypath name (Similar to Primary Key)
    //          autoIncrement - true or false (assigns an autonumber to the primary key / Keypath value)
    //                          Default value = false.
    //               skipSync - (optional) If true, skips all data synchronization in ixDbSync for a single transaction.
    //*********************************************************************************************************
    function CreateObjStore_(objectStoreName, pkName, autoIncrement, skipSync) {
        //Create a default value for the autoIncrement variable
        autoIncrement = typeof autoIncrement === 'undefined' ? false : autoIncrement;
        var objectStore;

        try {
            objectStore = ixDb.createObjectStore(objectStoreName, { keyPath: pkName, autoIncrement: autoIncrement });

            //ixDbSync - data sync hook
            if(ixDbSyncFlag && objectStoreName != "ixDbSync" && skipSync != true) {
                ixDbSync.createObjStoreSync(objectStoreName, pkName, autoIncrement);
            }

            //Log os creation. onsuccess does not fire for objectStore!
            console.log('ixDbEz: Created ObjectStore ' + objectStoreName + '.');
        } catch (e) {
            logError(e);
            console.log('ixDbEz Error: Create ObjectStore ' + objectStoreName + ' failed.');
        }
        return objectStore;
    }

    //*********************************************************************************************************
    //Function CreateIndex - Create IndexedDB object store index (similar to a table index on a field)
    //     objectStoreName - Name of the Object Store / Table "MyOsName"
    //              ixName - Name of the Index to create
    //           fieldName - Keypath name to add the index too.  (Can the name of any property / field in the object store)
    //              unique - true or false, if True - all values in the index must be unique.
    //                       Default value = false.
    //          multiEntry - true or false, see w3 documentation: http://www.w3.org/TR/IndexedDB/#dfn-multientry
    //                       Default value = false.
    //            skipSync - (optional) If true, skips all data synchronization in ixDbSync for a single transaction.
    //*********************************************************************************************************
    function CreateIndex_(objectStoreName, ixName, fieldName, unique, multiEntry, skipSync) {
        //Create a default value for the autoIncrement variable
        unique = typeof unique === 'undefined' ? false : unique;
        multiEntry = typeof multiEntry === 'undefined' ? false : multiEntry;

        try {
            var ObjectStore = ixDbVersionTansaction.objectStore(objectStoreName);
            var index = ObjectStore.createIndex(ixName, fieldName, { unique: unique, multiEntry: multiEntry });

            //ixDbSync - data sync hook
            if(ixDbSyncFlag && objectStoreName != "ixDbSync" && skipSync != true) {
                ixDbSync.createIndexSync(objectStoreName, ixName, fieldName, unique, multiEntry);
            }

            //Log index creation. onsuccess does not fire for index!
            console.log('ixDbEz: Created index: ' + ixName + ' against keypath: ' + fieldName + '.');
        } catch (e) {
            logError(e);
            console.log('ixDbEz Error: Created index - ' + ixName + ' failed.');
        }
    }

    //*********************************************************************************************************
    //Function Add      - Insert a record into an object store.
    //  objectStoreName - Name of the Object Store / Table "MyOsName"
    //            value - Record object or value to insert.
    //              key - (optional) Key to access record.
    //        onSuccess - (optional) callback function to execute if function successful.
    //          onError - (optional) callback function to execute if function fails.
    //         skipSync - (optional) If true, skips all data synchronization in ixDbSync for a single transaction.
    //*********************************************************************************************************
    function Add_(objectStoreName, value, key, onSuccess, onError, skipSync) {
        if (ixDb) {

            //The database is being created or upgraded, re-run when completed.
            if(ixDbVersionTansaction) {
                ixDbVersionTansaction.addEventListener ("complete", function() { Add_(objectStoreName, value, key, onSuccess, onError, skipSync); }, false);
                return;
            }

            var transaction = ixDb.transaction(objectStoreName, "readwrite" ); //IDBTransaction.READ_WRITE);
            var objectStore = transaction.objectStore(objectStoreName);

            request = typeof key === 'undefined' ? objectStore.add(value) : objectStore.add(value, key);

            request.onsuccess = function (e) {
                if(typeof onSuccess === 'function') {
                    onSuccess();
                }

                //ixDbSync - data sync hook
                if(ixDbSyncFlag && objectStoreName != "ixDbSync" && skipSync != true) {
                    ixDbSync.addPutSync(objectStoreName, value, key, "Add");
                }

                console.log('ixDbEz: Created record in ObjectStore: ' + objectStoreName + ".");
            };


            request.onerror = function (e) {
                logError(e, onError);
                console.log('ixDbEz Error: Create record in ObjectStore: ' + objectStoreName + " failed.");
            }
        }
        else {
            //The database is in the middle of opening
            if (ixDbRequest) {
                ixDbRequest.addEventListener ("success", function() { Add_(objectStoreName, value, key, onSuccess, onError, skipSync); }, false);
            }
        }
    }

    //*********************************************************************************************************
    //Function Clear - Delete all records from an object store.
    //     onSuccess - (optional) callback function to execute if function successful.
    //       onError - (optional) callback function to execute if function fails.
    //      skipSync - (optional) If true, skips all data synchronization in ixDbSync for a single transaction.
    //*********************************************************************************************************
    function Clear_(objectStoreName, onSuccess, onError, skipSync) {
        if (ixDb) {
            //The database is being created or upgraded, re-run when completed.
            if(ixDbVersionTansaction) {
                ixDbVersionTansaction.addEventListener ("complete", function() { Clear_(objectStoreName, onSuccess, onError, skipSync) }, false);
                return;
            }

            var transaction = ixDb.transaction(objectStoreName, "readwrite"); // IDBTransaction.READ_WRITE);
            var objectStore = transaction.objectStore(objectStoreName);

            var request = objectStore.clear();

            request.onsuccess = function (e) {
                if(typeof onSuccess === 'function') {
                    onSuccess();
                }

                //ixDbSync - data sync hook
                if(ixDbSyncFlag && objectStoreName != "ixDbSync" && skipSync != true) {
                    ixDbSync.clearSync(objectStoreName);
                }

                console.log('ixDbEz: Deleted all records from ObjectStore ' + objectStoreName + ".");
            };

            request.onerror = function (e) {
                logError(e, onError);
                console.log('ixDbEz Error: Clear ObjectStore: ' + objectStoreName + " failed.");
            }
        }
        else {
            //The database is in the middle of opening
            if (ixDbRequest) {
                ixDbRequest.addEventListener ("success", function() { Clear_(objectStoreName, onSuccess, onError, skipSync) }, false);
            }
        }
    }

    //*********************************************************************************************************
    //Function Put      - Replace or insert a record in an object store.
    //  objectStoreName - Name of the Object Store / Table "MyOsName"
    //            value - Record object or value to insert.
    //              key - (optional) Key to access record.
    //        onSuccess - (optional) callback function to execute if function successful.
    //          onError - (optional) callback function to execute if function fails.
    //         skipSync - (optional) If true, skips all data synchronization in ixDbSync for a single transaction.
    //*********************************************************************************************************
    function Put_(objectStoreName, value, key, onSuccess, onError, skipSync) {
        if (ixDb) {
            //The database is being created or upgraded, re-run when completed.
            if(ixDbVersionTansaction) {
                ixDbVersionTansaction.addEventListener ("complete", function() { Put_(objectStoreName, value, key, onSuccess, onError, skipSync); }, false);
                return;
            }

            var transaction = ixDb.transaction(objectStoreName, "readwrite"); //IDBTransaction.READ_WRITE);
            var objectStore = transaction.objectStore(objectStoreName);

            try {
                var request = typeof key === 'undefined' ? objectStore.put(value) : objectStore.put(value, key);
            } catch (e) {
                console.log(e);
                // This is a workaround for the fact that chrome doesn't support blobs.
                // from: https://code.google.com/p/chromium/issues/detail?id=108012#c42
                //* when reading something that should be a blob, check if typeof value === "string"; if so, return new Blob([value], {type: 'application/octet-stream'}); otherwise return the value, which should be a Blob
                console.log('Couldn\'t save the Blob, trying a workaround');
                angular.forEach(value, function(data, index) {
                    if (Object.prototype.toString.call(data) === '[object Blob]') {
                        var reader = new FileReader();
                        reader.readAsBinaryString(data);
                        reader.onloadend = function(e) {
                            value[index] = reader.result;

                            Put_(objectStoreName, value, key, onSuccess, onError, skipSync);
                        };
                    }
                });

                return;
            }

            transaction.oncomplete = function () {
                ixDb.transaction(objectStoreName).objectStore(objectStoreName).get(0).onsuccess = function (e) {
                    console.warn('transaction onSuccess');
                    if(typeof onSuccess === 'function') {
                        onSuccess(e.target.result);
                    }

                    //ixDbSync - data sync hook
                    if(ixDbSyncFlag && objectStoreName != "ixDbSync" && skipSync != true) {
                        //Pass the primary key value to ixDbSync for the server lastUpdateLog
                        var logKey = typeof key === 'undefined' ? value[objectStore.keyPath] : key;
                        ixDbSync.addPutSync(objectStoreName, value, key, "Put", logKey);
                    }

                    console.log('ixDbEz: Put record into ObjectStore ' + objectStoreName + ".");
                };
            };

            transaction.onerror = function (e) {

                logError(e, onError);
                console.log('ixDbEz Error: Put record into ObjectStore ' + objectStoreName + " failed.");
            }
        }
        else {
            if (ixDbRequest) {
                ixDbRequest.addEventListener ("success", function() { Put_(objectStoreName, value, key, onSuccess, onError, skipSync); }, false);
            }
        }
    }

    //*********************************************************************************************************
    //Function updateKey - Replace or insert a record in an object store.
    //   objectStoreName - Name of the Object Store / Table "MyOsName"
    //            oldKey - The Key value that needs to be updated.
    //            newKey - New value for the oldKey.
    //         onSuccess - (optional) callback function to execute if function successful.
    //           onError - (optional) callback function to execute if function fails.
    //          skipSync - (optional) If true, skips all data synchronization in ixDbSync for a single transaction.
    //
    //   newKey Warning! - If newKey exists in the ObjectStore, it's value will be replaced by oldKey.value
    //*********************************************************************************************************
    function UpdateKey_(objectStoreName, oldKey, newKey, onSuccess, onError, skipSync) {
        if (ixDb) {

            //The database is being created or upgraded, re-run when completed.
            if(ixDbVersionTansaction) {
                ixDbVersionTansaction.addEventListener ("complete", function() { UpdateKey_(objectStoreName, oldKey, newKey, onSuccess, onError, skipSync); }, false);
                return;
            }

            var keyInObject = false;
            var transaction = ixDb.transaction(objectStoreName, "readwrite"); // IDBTransaction.READ_WRITE);
            var objectStore = transaction.objectStore(objectStoreName);

            //Check oldKey exists request
            var request = objectStore.get(oldKey);

            request.onsuccess = function (e) {
                //Get the value from the oldKey record
                var oldKeyResult = e.result||this.result;

                //oldKey provided does not exist in database.
                if(typeof oldKeyResult === 'undefined'){
                    console.log('ixDbEz Error: updateKey failed. Key: ' + oldKey + ' does not exist in ObjectStore '  + objectStoreName + ".");
                }
                //oldKey provided does exist in the database
                else {
                    //if the value in the oldKey record is an object, and that object contains a
                    //property that matches the current ObjectStore's KeyPath name, update that property
                    //with the newKey value.
                    if(typeof oldKeyResult === 'object' && objectContainsProperty_(oldKeyResult, objectStore.keyPath)){
                        oldKeyResult[objectStore.keyPath] = newKey;
                        //since the newKey was updated in the object, newKey variable must = undefined
                        //or add_ and put_ will fail. keyInObject is checked later to set newKey = undefined
                        keyInObject = true;
                    }

                    //delete oldKey request
                    var request = objectStore.delete(oldKey);

                    //ixDbSync - data sync hook for above delete operation
                    if(ixDbSyncFlag && objectStoreName != "ixDbSync" && skipSync != true) {
                        ixDbSync.deleteSync(objectStoreName, oldKey);
                    }

                    request.onsuccess = function (e) {

                        //check newKey exists request
                        var request = objectStore.get(newKey);

                        request.onsuccess = function (e) {
                            var newKeyResult = e.result || this.result;

                            //newKey provided does not exist in database, so a new record is added
                            if(typeof newKeyResult === 'undefined'){
                                if(keyInObject){
                                    Add_(objectStoreName, oldKeyResult, undefined , onSuccess, onError, skipSync);
                                }
                                else{
                                    Add_(objectStoreName, oldKeyResult, newKey, onSuccess, onError, skipSync);
                                }
                            }
                            //newKey does exist in database, and it's value is replaced.
                            else {
                                if(keyInObject){
                                    Put_(objectStoreName, oldKeyResult, undefined , onSuccess, onError, skipSync);
                                }
                                else{
                                    Put_(objectStoreName, oldKeyResult, newKey, onSuccess, onError, skipSync);
                                }
                            } //else - newKey exists
                        } //check newKey.onsuccess

                        //check newKey failed
                        request.onerror = function (e) {
                            var errEvent = e.result||this.result;
                            logError(errEvent, onError);
                            console.log('ixDbEz Error: updateKey failed. Key: ' + newKey + ' is not valid in ObjectStore: '  + objectStoreName + ".");
                        }

                    } //delete oldKey.onsuccess

                    //delete oldKey failed
                    request.onerror = function (e) {
                        var errEvent = e.result||this.result;
                        logError(errEvent, onError);
                        console.log('ixDbEz Error: updateKey failed. Could not delete Key: ' + oldKey + ' from ObjectStore: '  + objectStoreName + ".");
                    }

                }  //else - oldKey exists
            } //check oldKey.onsuccess

            //check oldKey failed
            request.onerror = function (e) {
                var errEvent = e.result||this.result;
                logError(errEvent, onError);
                console.log('ixDbEz Error: updateKey failed. Key: ' + oldKey + ' is not valid in ObjectStore: '  + objectStoreName + ".");

            }

        } // ixDb exists
        else{
            if (ixDbRequest) {
                ixDbRequest.addEventListener ("success", function() { UpdateKey_(objectStoreName, oldKey, newKey, onSuccess, onError, skipSync); }, false);
            }
        }
    } // function

    //*********************************************************************************************************
    //Function Delete   - Delete a record in an object store.
    //  objectStoreName - Name of the Object Store / Table "MyOsName"
    //              key - Key of the record to be deleted.
    //        onSuccess - (optional) callback function to execute if function successful.
    //          onError - (optional) callback function to execute if function fails.
    //         skipSync - (optional) If true, skips all data synchronization in ixDbSync for a single transaction.
    //*********************************************************************************************************
    function Delete_(objectStoreName, key, onSuccess, onError, skipSync) {
        if (ixDb) {

            //The database is being created or upgraded, re-run when completed.
            if(ixDbVersionTansaction) {
                ixDbVersionTansaction.addEventListener ("complete", function() { Delete_(objectStoreName, key, onSuccess, onError, skipSync); }, false);
                return;
            }

            var transaction = ixDb.transaction(objectStoreName, "readwrite"); // IDBTransaction.READ_WRITE);
            var objectStore = transaction.objectStore(objectStoreName);

            request = objectStore.delete(key);

            request.onsuccess = function (e) {
                if(typeof onSuccess === 'function') {
                    onSuccess();
                }

                //ixDbSync - data sync hook
                if(ixDbSyncFlag && objectStoreName != "ixDbSync" && skipSync != true) {
                    ixDbSync.deleteSync(objectStoreName, key);
                }

                console.log('ixDbEz: Deleted record key: ' + key + ' from ObjectStore ' + objectStoreName + ".");
            };

            request.onerror = function (e) {
                var errEvent = e.result||this.result;
                logError(errEvent, onError);
                console.log('ixDbEz Error: Deleted record key: ' + key + ' from ObjectStore ' + objectStoreName + " failed.");
            }
        }
        else{
            if (ixDbRequest) {
                ixDbRequest.addEventListener ("success", function() { Delete_(objectStoreName, key, onSuccess, onError, skipSync); }, false);
            }
        }
    }

    //*********************************************************************************************************
    //Function getCursor - Returns a cursor for the requested ObjectStore
    //  objectStoreName  - Name of the Object Store / Table "MyOsName"
    //         onSuccess - Name of the function to call and pass the cursor request back to upon
    //                      successful completion.
    //           onError - (optional) callback function to execute if function fails.
    //          keyRange - (optional) IDBKeyRange to use when getting the cursor.
    //         readWrite - (optional) If set to true, returns a readwrite cursor.
    //         indexName - (optional) Name of a valid objectStore index.  If provided, the cursor is opened
    //                                using the requested indexName.
    //     onSuccess Ex. - getCursor_("ObjectStore_Name", MyCallBackFunction)
    //                      !! onSuccess function definition must have input variable for the request object !!
    //
    //                      Function MyCallBackFunction(CursorRequestObj) {
    //                                   CursorRequestObj.onsuccess = function() {//do stuff here};
    //                      }
    //
    //*********************************************************************************************************
    function getCursor_(objectStoreName, onSuccess, onError, keyRange, readWrite, indexName) {
        //The the openCursor call is asynchronous, so we must check to ensure a database
        //connection has been established and then provide the cursor via callback.
        if (ixDb) {
            //If the database is in the middle of an upgrade, return an undefined cursor.
            if(ixDbVersionTansaction || ixDbVersionRequest) {
                onSuccess();
            }
            else
            {
                try{
                    var transaction;
                    if(readWrite == true) {
                        transaction = ixDb.transaction(objectStoreName, "readwrite"); // IDBTransaction.READ_ONLY);
                    }
                    else{
                        transaction = ixDb.transaction(objectStoreName, "readonly");
                    }

                    var objectStore = transaction.objectStore(objectStoreName);

                    //If an indexName is provided, the cursor is opened using the requested index
                    //Otherwise it is opened via the object store. In either case, cursor is opened using
                    //a keyRange, if one is provided.
                    var cursor;
                    if(typeof indexName === "undefined") {
                        cursor = typeof keyRange === "undefined" ? objectStore.openCursor() : objectStore.openCursor(keyRange);
                    }
                    else {
                        var index = objectStore.index(indexName);
                        cursor = typeof keyRange === "undefined" ? index.openCursor() : index.openCursor(keyRange);
                    }

                    //Return the requested cursor via the callback function provided by the user.
                    onSuccess(cursor);
                    console.log('ixDbEz: Getting cursor request for ' + objectStoreName + ".");
                }
                catch(e){
                    logError(e, onError);
                    console.log('ixDbEz Error: getCursor failed');
                }
            }
        }
        else {
            if (ixDbRequest) {
                ixDbRequest.addEventListener ("success", function() { getCursor_(objectStoreName, onSuccess, onError); }, false);
            }
        }
    }

    //*********************************************************************************************************
    //Function objectContainsProperty - Returns true if the object contains the requested property, otherwise false.
    //                         object - A valid javascript object.
    //                       property - A string with the requested property name.
    //*********************************************************************************************************
    function objectContainsProperty_(object, property){
        var prototype = object.__prototype__ || object.constructor.prototype;
        return (property in object) && (!(property in prototype)
            || prototype[property] !== object[property]);
    }

    return {
        startDB: StartDB_,
        createObjStore: CreateObjStore_,
        createIndex: CreateIndex_,
        add : Add_,
        clear: Clear_,
        put : Put_,
        delete : Delete_,
        getCursor: getCursor_,
        updateKey : UpdateKey_,
        objectContainsProperty: objectContainsProperty_
    }
})();

//default console error handler
ixDbEz.onerror = function () { logError(e) };

//*********************************************************************************************************
//Function logError - Writes all errors to console.log
//         errEvent - event objects or and other javascript object which contains a errEvent.code
//                      and errEvent.message property.
//          onError - (optional) callback function to execute if function fails.
//
//              Tip - Re-route any Console.log messages to whereever you want. (div file etc...)
//                      window.console.log = function (msg) { //your code here }
//*********************************************************************************************************
function logError(errEvent, onError, transaction) {
    //if a valid onError function was passed, execute it.
    if(typeof onError === 'function') {
        onError();
    }

    //if a transaction object was passed, attempt to abort it
    if(typeof transaction !== 'undefined' && transaction.constructor.name == "IDBTransaction") {
        transaction.abort();
    }

    console.log('ixDbEz Error' + '(' + errEvent.code + '): ' + errEvent.message + '.');
}