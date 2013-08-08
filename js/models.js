'use strict';

angular.module('podcasts.models', ['podcasts.database', 'podcasts.utilities'])
    .service('feeds', ['$log', '$q', 'db', 'downloaderBackend', 'xmlParser', 'feedItems', 'utilities', '$rootScope', function($log, $q, db, downloaderBackend, xmlParser, feedItems, utilities, $rootScope) {
        var feeds = [];

        function _add(url) {
            var feedService = this;
            var finishSave = function(newFeed) {
                var promise = db.put("feed", newFeed)
                    .then(function(key) {
                        newFeed.id = key;

                        feedService.feeds.push(newFeed);
                        feedService.downloadItems(newFeed);
                    });
            };

            var cleanedUrl = utilities.clean_url(url);

            var promise = downloaderBackend.downloadXml(cleanedUrl);
            promise.then(function(xml) {
                var channelChildren = xml.find('channel').children(),
                    newFeed = {},
                    imageUrl;

                newFeed.url = cleanedUrl;
                newFeed.title = xml.find('title').text();
                newFeed.summary = xml.find('description').text();
                newFeed.nrQueueItems = 1;

                angular.forEach(channelChildren, function(value, key) {
                    if ('itunes:image' === angular.element(value)[0].nodeName.toLowerCase()) {
                        imageUrl = angular.element(value).attr('href');
                    }

                    if ('itunes:author' === angular.element(value)[0].nodeName.toLowerCase()) {
                        newFeed.author = angular.element(value).text();
                    }
                });


                var file = downloaderBackend.downloadFile(imageUrl);
                file.then(function(fileBlob) {
                    newFeed.image = fileBlob;
                    finishSave(newFeed);
                }, function() {
                    finishSave(newFeed);
                });
            }, function() {
                console.warn('Could not fetch XML for feed, adding just URL for now');
                var newFeed = {};
                newFeed.url = cleanedUrl;

                finishSave(newFeed);
            });
        }

        function _get(id) {
            id = parseInt(id, 10);
            var deferred = $q.defer();

            db.getOne("feed", id)
                .then(function(feed) {
                    if (typeof feed.image === 'string') {
                        feed.image = new Blob([feed.image]);
                    }

                    feed.items = [];
                    db.get("feedItem", IDBKeyRange.only(feed.id), "ixFeedId")
                        .then(function(results) {
                            angular.forEach(results, function(item) {
                                feed.items.push(item);
                            });

                            $rootScope.$apply(deferred.resolve(feed));
                        });
                }, function(value) {
                    deferred.reject();
                });

            return deferred.promise;
        }

        function _list($scope) {
            var feeds = this.feeds,
                promise = db.get("feed");

            promise.then(function(results) {
                angular.forEach(results, function(item) {
                    if (typeof item.image === 'string') {
                        item.image = new Blob(
                            [item.image],
                            {type: 'application/octet-stream'}
                        );
                    }

                    feeds.push(item);
                });

                $scope.$apply();
            });
        }

        function _delete(id) {
            $log.info('Deleting feed with ID ' + id);
            feedItems.deleteByFeedId(id);
            db.delete("feed", id);
        }

        /**
         *
         * @param updateStatus  function that gets called for each item it goes through
         *                      Takes the feedItem as the argument
         */
        function _downloadAllItems(updateStatus) {
            var feedService = this,
                promise = db.get("feed");

            promise.then(function(results) {
                angular.forEach(results, function(item) {
                    feedService.downloadItems(item, updateStatus);
                });

                updateStatus();
            });
        }

        function _downloadItems(feedItem, updateStatus) {
            var promise = downloaderBackend.downloadXml(feedItem.url),
                feedObjects = [];

            promise.then(function(data) {
                angular.forEach(
                    data.find('item'),
                    function(element, index) {
                        if (index < 3) { // TODO: this should be a global setting and/or a per-feed setting
                            feedObjects.push(feedItems.getFeedItemFromXml(element))
                        }
                    }
                );

                angular.forEach(feedObjects, function(feedObject, index) {
                    feedObject.feedId = feedItem.id;
                    if (0 === index) {
                        feedObject.queued = 1;
                    } else {
                        feedObject.queued = 0;
                    }

                    feedItems.add(feedObject)
                        .then(function(item) {
                            if (typeof updateStatus === 'function') {
                                updateStatus(item, feedItem);
                            }
                        });
                });
            });
        }

        return {
            add: _add,
            get: _get,
            list: _list,
            delete: _delete,
            downloadAllItems: _downloadAllItems,
            downloadItems: _downloadItems
        };
    }])
    .service('feedItems', ['db', '$q', '$rootScope', function(db, $q, $rootScope) {
        function _get(id, onSuccess, onFailure) {
            db.getOne("feedItem", id)
                .then(function(value) {
                    onSuccess(value);
                }, function() {
                    onFailure();
                });
        }

        function _getFeedItemFromXml(xml) {
            var newFeedItem = {},
                searchableXml = angular.element(xml);

            newFeedItem.guid = searchableXml.find('guid').text();
            newFeedItem.title = searchableXml.find('title').text();
            newFeedItem.link = searchableXml.find('link').text();
            newFeedItem.date = Date.parse(searchableXml.find('pubDate').text());
            newFeedItem.description = searchableXml.find('description').text();
            newFeedItem.audioUrl = searchableXml.find('enclosure').attr('url');

            return newFeedItem;
        }

        function _delete(feedItemId) {
            db.delete("feedItem", feedItemId);
        }

        function _deleteByFeedId(feedId) {
            db.get("feedItem", IDBKeyRange.only(feedId), "ixFeedId")
                .then(function(results) {
                    angular.forEach(results, function(item) {
                        this._delete(item.id);
                    })
                });
        }

        function _add(object) {
            var deferred = $q.defer(),
                newFeedItem = {
                    guid: object.guid,
                    feedId: object.feedId,
                    title: object.title,
                    link: object.link,
                    date: object.date,
                    description: object.description,
                    audioUrl: object.audioUrl,
                    queued: object.queued
                },
                promise = db.put("feedItem", newFeedItem);

            promise.then(function() {
                deferred.resolve(newFeedItem);
            });

            return deferred.promise;
        }

        function _save(object) {
            db.put("feedItem", object);
        }

        function _getNextInQueue(feedItem) {
            var tempQueueList = { queue: [], addToQueue: function(item) { this.queue.push(item); } },
                deferred = $q.defer();

            this.listQueue(tempQueueList, function() {
                var returnNextValue = false,
                    didReturnValue = false;
                angular.forEach(tempQueueList.queue, function(value, key) {
                    if (returnNextValue) {
                        deferred.resolve(value);
                        returnNextValue = false;
                        didReturnValue = true;
                    }

                    if (feedItem.id === value.id) {
                        returnNextValue = true;
                    }
                });

                if (!didReturnValue) {
                    deferred.reject('Could not find next queue item');
                }
            });

            return deferred.promise;
        }

        /**
         * Not sure if this is still used
         * @param queueList
         * @param done
         */
        function _listQueue(queueList, done) {
            db.get("feedItem", IDBKeyRange.only(1), "ixQueued")
                .then(function(results) {
                    angular.forEach(results, function(item) {
                        // This additional check is necessary, since the index doesn't seem to always catch correctly
                        if (item.queued) {
                            queueList.addToQueue(item);
                        }
                    });

                    done();
                });
        }

        function _unQueue(feedItemId) {
            var feedItem = _get(feedItemId, function(feedItem) {
                feedItem.queued = 0;

                var promise = db.put("feedItem", feedItem)
                    .then(function() {
                        $rootScope.$broadcast('queueListRefresh');
                    });
            });
        }

        function _addToQueue(feedItemId) {
            var feedItem = _get(feedItemId, function(feedItem) {
                feedItem.queued = 1;

                var promise = db.put("feedItem", feedItem);
                promise.then(function() {
                    $rootScope.$broadcast('queueListRefresh');
                });
            });
        }


        return {
            get: _get,
            getFeedItemFromXml: _getFeedItemFromXml,
            delete: _delete,
            deleteByFeedId: _deleteByFeedId,
            add: _add,
            save: _save,
            getNextInQueue: _getNextInQueue,
            listQueue: _listQueue,
            unQueue: _unQueue,
            addToQueue: _addToQueue
        }
    }])
;
