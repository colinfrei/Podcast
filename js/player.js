angular.module('podcasts.player', [])
    .run(['player', function(player) {
        var acm = navigator.mozAudioChannelManager;
        if (acm) {
            acm.addEventListener('headphoneschange', function onheadphoneschange() {
                if (!acm.headphones && player.playing()) {
                    player.pause();
                }
            });
        }
    }])
    .directive('progressBar', function($timeout) {
        // return the directive link function. (compile function not needed)
        return {
            link: function(scope, element, attrs)
            {
                var timeoutId; // timeoutId, so that we can cancel the time updates

                // used to update the UI
                function updateWidth() {
                    var duration = scope.$eval(attrs.progressBarDuration),
                        current = scope.$eval(attrs.progressBarCurrent);

                    var percentage = Math.round(current / (duration / 100));

                    if (percentage > 100) {
                        percentage = 100;
                    }

                    element.css('width', percentage + '%');

                    scope.$digest();
                }

                // schedule update in one second
                function updateLater() {
                    // save the timeoutId for canceling
                    timeoutId = $timeout(function() {
                        updateWidth(); // update DOM
                        updateLater(); // schedule another update
                    }, 1000, false);
                }

                function initDom() {
                    var currentProgressElement = angular.element('<div class="progressBarCurrent">');
                    element.append(currentProgressElement);
                }

                // listen on DOM destroy (removal) event, and cancel the next UI update
                // to prevent updating time after the DOM element was removed.
                element.on('$destroy', function() {
                    $timeout.cancel(timeoutId);
                });

                initDom();
                updateLater(); // kick off the UI update process.
            },
            scope: true
        };
    })
    .service('player', ['url', '$timeout', 'feedItems', '$rootScope', '$log', '$q', function(url, $timeout, feedItems, $rootScope, $log, $q) {
        var audio,
            currentFeedItem = null,
            nowPlaying = {
                position: 0,
                duration: 0,
                title: '',
                description: '',
                feed: '',
                date: 0,
                context: ''
            };

        audio = new Audio();
        audio.setAttribute("mozaudiochannel", "content");
        _addOfflineErrorHandler();
        _addPauseEventListener();

        function _addOfflineErrorHandler()
        {
            audio.addEventListener("error", function(event) {
                $log.info('Error when loading audio file, continuing to next file');

                var nextFeedItemPromise = feedItems.getNextInQueue(currentFeedItem);
                $rootScope.$apply(nextFeedItemPromise.then(function(nextFeedItem) {
                    play(nextFeedItem);
                }));
            });
        }

        function _addPauseEventListener()
        {
            audio.addEventListener("pause", function(event) {
                currentFeedItem.position = Math.floor(event.target.currentTime);
                feedItems.save(currentFeedItem);
            });
        }

        function play(feedItem, context)
        {
            var delayPlay = false;
            if (feedItem) {
                $log.info('playing: ' + feedItem.title);

                currentFeedItem = feedItem;

                var audioSrc;

                if (feedItem.audio) {
                    $log.info('Playing audio from download');
                    audioSrc = url.createObjectUrl(feedItem.audio);
                } else {
                    $log.info('Playing audio from web');
                    audioSrc = feedItem.audioUrl;
                }

                audio.src = audioSrc;
                updateSong(feedItem);

                if (feedItem.position) {
                    delayPlay = true;
                    angular.element(audio).bind("canplay", function(event) {
                        event.target.currentTime = feedItem.position;

                        angular.element(this).unbind("canplay");

                        audio.play();
                    });
                }
            }

            if (!delayPlay) {
                audio.play();
            }

            audio.addEventListener("ended", function(event) {
                continueToNextItem(feedItem)
                    .then(function(nextFeedItem) {
                        play(nextFeedItem);

                        unQueueFeedItem(feedItem);
                    }, function(error) {
                        $log.warn('got Errror when fetching next feed item');

                        unQueueFeedItem(feedItem);
                    });

                angular.element(this).unbind();
            });
        }

        function continueToNextItem(feedItem)
        {
            var deferred = $q.defer();
            feedItems.getNextInQueue(feedItem)
                .then(function(nextFeedItem) {
                    deferred.resolve(nextFeedItem);
                }, function(error) {
                    deferred.reject(error);
                });

            return deferred.promise;
        }

        function unQueueFeedItem(feedItem)
        {
            feedItem.queued = 0;
            feedItem.position = 0;

            feedItems.save(feedItem);
        }

        function pause()
        {
            audio.pause();
        }

        function playing()
        {
            return !audio.paused;
        }

        function updateSong(feedItem)
        {
            nowPlaying.title = feedItem.title;
            nowPlaying.currentFeedItem = feedItem;
            nowPlaying.description = feedItem.description;
            nowPlaying.feed = feedItem.feed;
            nowPlaying.date = feedItem.date;
        }

        function jumpAudio(distance)
        {
            audio.currentTime = audio.currentTime + distance;
        }


        return {
            audio: audio,
            feedItem: currentFeedItem,
            nowPlaying: nowPlaying,
            play: play,
            pause: pause,
            playing: playing,
            jumpAudio: jumpAudio
        };
    }]);