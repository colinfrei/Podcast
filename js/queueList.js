angular.module('podcasts.queueList', ['podcasts.database'])
    .run(['queueList', function(queueList) {
        queueList.rebuildList();
    }])
    .service('queueList', ['db', '$rootScope', function(oldDb, $rootScope) {
        var queueList = [];

        function getQueueList() {
            return queueList;
        }

        function rebuildList() {
            queueList = [];

            oldDb.getCursor("feedItem", function(ixDbCursorReq)
            {
                if(typeof ixDbCursorReq !== "undefined") {
                    ixDbCursorReq.onsuccess = function (e) {
                        var cursor = ixDbCursorReq.result || e.result;
                        if (cursor) {
                            // This additional check is necessary, since the index doesn't seem to always catch correctly
                            if (cursor.value.queued) {
                                queueList.push(cursor.value);
                            }

                            cursor.continue();
                        } else {
                            $rootScope.$apply();
                        }
                    }
                }
            }, undefined, IDBKeyRange.only(1), false, 'ixQueued');
        }

        return {
            rebuildList: rebuildList,
            getQueueList: function() {
                return queueList;
            }
        };
    }])
;
