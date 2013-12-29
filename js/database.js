'use strict';

angular.module('podcasts.database', [])
    .run(['dbBackend', function(dbBackend) {
        var dbConfig = (function () {
            //Create IndexedDB ObjectStore and Indexes via ixDbEz
            dbBackend.createObjStore("feed", "id", true);
            dbBackend.createIndex("feed", "ixUrl", "url", true);
            dbBackend.createObjStore("feedItem", "id", true);
            dbBackend.createIndex("feedItem", "ixGuid", "guid", true);
            dbBackend.createIndex("feedItem", "ixFeedId", "feedId");
            dbBackend.createIndex("feedItem", "ixQueued", "queued");
            dbBackend.createObjStore("setting", "id", true);
            dbBackend.createIndex("setting", "ixName", "name", true);
            dbBackend.put("setting", {'name': "refreshInterval", 'value': "0"});
        });

        //Create or Open the local IndexedDB database via ixDbEz
        dbBackend.startDB("podcastDb", 11, dbConfig, undefined, undefined, false);
    }])
    .value('dbBackend', ixDbEz)
    .service('db', ['$q', '$rootScope', 'dbBackend', function($q, $rootScope, dbBackend) {
        var _getOne = function(store, identifier) {
            var deferred = $q.defer();

            dbBackend.getCursor(store, function(ixDbCursorReq)
            {
                if(typeof ixDbCursorReq !== "undefined") {
                    ixDbCursorReq.onsuccess = function (e) {
                        var cursor = ixDbCursorReq.result || e.result;
                        if (cursor) {
                            $rootScope.$apply(deferred.resolve(cursor.value));

                            cursor.continue();
                        } else {
                            //TODO: not sure if this'll work, since it may both resolve and reject.
                            // May need to check if any were resolved or not first

                            // deferred.reject();
                        }
                    };
                } else {
                    deferred.reject();
                }
            }, null, IDBKeyRange.only(identifier));

            return deferred.promise;
        };

        function _get(store, range, indexName) {
            var deferred = $q.defer(),
                results = [];

            dbBackend.getCursor(
                store,
                function(ixDbCursorReq) {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                results.push(cursor.value);

                                cursor.continue();
                            } else {

                                $rootScope.$apply(deferred.resolve(results));
                            }
                        };
                    } else {
                        deferred.reject();
                    }
                },
                function() {
                    deferred.reject();
                },
                range,
                false,
                indexName
            );

            return deferred.promise;
        }

        function _put(store, data, id) {
            var deferred = $q.defer();

            dbBackend.put(store, data, id, function(key) {
                $rootScope.$apply(deferred.resolve(key));
            }, function() {
                deferred.reject('"Put" to DB failed');
            });

            return deferred.promise;
        }

        function _delete(store, id) {
            dbBackend.delete(store, id);
        }

        return {
            getOne: _getOne,
            get: _get,
            put: _put,
            delete: _delete
        };
    }]);
