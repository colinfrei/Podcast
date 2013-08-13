angular.module('podcasts.queueList', ['podcasts.database'])
    .run(['queueList', function(queueList) {
        queueList.rebuildList();
    }])
    .service('queueList', ['db', '$rootScope', function(db, $rootScope) {
        var queueList = [];

        function getQueueList() {
            return queueList;
        }

        function rebuildList() {
            queueList.length = 0;

            db.get("feedItem", IDBKeyRange.only(1), "ixQueued")
                .then(function(results) {
                    angular.forEach(results, function(item) {
                        if (item.queued) {
                            queueList.push(item);
                        }
                    });

                    $rootScope.$apply();
                });
        }

        return {
            rebuildList: rebuildList,
            getQueueList: function() {
                return queueList;
            }
        };
    }])
;
