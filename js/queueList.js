'use strict';

angular.module('podcasts.queueList', ['podcasts.database'])
    .run(['queueList', '$rootScope', function(queueList, $rootScope) {
        queueList.rebuildList();

        $rootScope.$on('queueListRefresh', function(event) {
            $rootScope.$apply(queueList.rebuildList());
        });
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
