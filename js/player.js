'use strict';

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
    .directive('playTime', function($timeout) {
        // return the directive link function. (compile function not needed)
        return {
            link: function(scope, element, attrs)
            {
                var timeoutId; // timeoutId, so that we can cancel the time updates

                // used to update the UI
                function updateTime() {
                    var audioElement = scope.$eval(attrs.playTime),
                        currentTime = audioElement.currentTime,
                        duration = audioElement.duration,
                        output,
                        formatWithSeconds = false;

                    if (!currentTime) {
                        return;
                    }

                    if (duration < 120 || (!duration && currentTime < 120)) {
                        formatWithSeconds = true;
                    }

                    output = formatTime(currentTime, formatWithSeconds);

                    if (duration) {
                        output += '/' + formatTime(duration, formatWithSeconds);
                    }

                    element.text(output);

                    scope.$digest();
                }

                // schedule update in one second
                function updateLater() {
                    // save the timeoutId for canceling
                    timeoutId = $timeout(function() {
                        updateTime(); // update DOM
                        updateLater(); // schedule another update
                    }, 1000, false);
                }

                function formatTime(time, withSeconds) {
                    var seconds, minutes, hours;
                    seconds = Math.floor(time);

                    if (seconds > 60 || (withSeconds && seconds < 120)) {
                        minutes = Math.floor(seconds/60);

                        seconds = seconds % 60;
                        if (seconds < 10) {
                            seconds = '0' + seconds;
                        }
                    }
                    if (minutes > 60) {
                        hours = Math.floor(minutes/60);

                        minutes = minutes % 60;
                        if (minutes < 10) {
                            minutes = '0' + minutes;
                        }
                    }

                    if (hours) {
                        return hours + ':' + minutes + ':' + seconds;
                    } else if (minutes) {
                        return minutes + ':' + seconds;
                    } else {
                        var output = seconds;

                        if (withSeconds) {
                            output += 's';
                        } else {
                            if (output < 10) {
                                output = "0" + output;
                            }
                            output = '0:' + output;
                        }

                        return output;
                    }
                }

                // listen on DOM destroy (removal) event, and cancel the next UI update
                // to prevent updating time after the DOM element was removed.
                element.on('$destroy', function() {
                    $timeout.cancel(timeoutId);
                });

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
                updatePositionInDb(event.target, currentFeedItem);
            });
        }

        function updatePositionInDb(audioElement, feedItem)
        {
            feedItem.position = Math.floor(audioElement.currentTime);
            feedItems.save(feedItem)
                .then(function() {
                    if (audioElement.duration <= audioElement.currentTime) {
                        $rootScope.$broadcast('queueListRefresh');
                    }
                });
        }

        function play(feedItem)
        {
            var delayPlay = false;
            if (feedItem) {
                $log.info('playing: ' + feedItem.title);

                // pausing so that the position is saved
                if (currentFeedItem) {
                    updatePositionInDb(audio, currentFeedItem);
                }

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

            feedItems.save(feedItem)
                .then(function() {
                    $rootScope.$broadcast('queueListRefresh');
                });
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
