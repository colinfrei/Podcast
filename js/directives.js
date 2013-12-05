angular.module('podcast.directives', [])
    .directive('pullToRefresh', ['$timeout', function($timeout) {
        return function(scope, element, attrs, feedItems) {
            var myScroll,
                pullDownEl, pullDownOffset,
                wrapper = angular.element('<div class="scroller"></div>');

            element.contents().wrap(wrapper[0]);

            wrapper.prepend('<div id="pullDown">' +
                '<span class="pullDownIcon"></span><span class="pullDownLabel">Pull down to refresh...</span>' +
            '</div>');

            pullDownEl = document.getElementById('pullDown');
            pullDownOffset = pullDownEl.offsetHeight;

            //TODO: get ID from context somehow?
            myScroll = new iScroll(element[0], {
                useTransition: true,
                topOffset: pullDownOffset,
                vScrollbar: false,
                onRefresh: function () {
                    if (pullDownEl.className.match('loading')) {
                        pullDownEl.className = '';
                        pullDownEl.querySelector('.pullDownLabel').innerHTML = 'Pull down to refresh...';
                    }
                },
                onScrollMove: function () {
                    if (this.y > 5 && !pullDownEl.className.match('flip')) {
                        pullDownEl.className = 'flip';
                        pullDownEl.querySelector('.pullDownLabel').innerHTML = 'Release to refresh...';
                        this.minScrollY = 0;
                    } else if (this.y < 5 && pullDownEl.className.match('flip')) {
                        pullDownEl.className = '';
                        pullDownEl.querySelector('.pullDownLabel').innerHTML = 'Pull down to refresh...';
                        this.minScrollY = -pullDownOffset;
                    }
                },
                onScrollEnd: function () {
                    if (pullDownEl.className.match('flip')) {
                        pullDownEl.className = 'loading';
                        pullDownEl.querySelector('.pullDownLabel').innerHTML = 'Loading...';

                        scope.downloadItems()
                            .then(function() {
                                myScroll.refresh();
                            });
                    }
                }
            });

            scope.$watch(
                function() { return scope.queue; },
                function() {
                    $timeout(function() {
                        myScroll.refresh();
                    }, 5);
                },
                true
            );
        }
    }])
    .directive('hold', ['$timeout', function($timeout) {
        return function(scope, element, attrs) {
            var startTime, moved, holdTimer = false;
            element.bind('touchstart', function(event) {
                startTime = new Date().getTime();

                $timeout.cancel(holdTimer);
                holdTimer = $timeout(function() {
                    scope.$eval(attrs.hold);
                }, 500);
            });
            element.bind('touchmove', function() {
                $timeout.cancel(holdTimer);
            });
            element.bind('touchend', function(event) {
                if (new Date().getTime() - startTime > 500) {
                    event.preventDefault();
                } else {
                    $timeout.cancel(holdTimer);
                    element[0].click();
                }
            });
        }
    }])
    .directive('scroll', function() {
        return {
            priority: -1000,
            compile: function compile(tElement, tAttrs) {
                return function postLink(scope, element, attrs, feedItems) {
                    //TODO: this should probably work somehow without setting a timeout
                    // - need to be able to set the order of watchers?
                    setTimeout(function() {
                        var scroll = new iScroll(element[0], {vScrollbar: false});
                    }, 500);
                }
            }
        };
    })
    .directive('blob', function() {
        return function postLink(scope, element, attrs) {
            var updateImage = function () {
                var blob = scope.$eval(attrs.blob);
                if (blob !== undefined) {
                    var imgUrl = window.URL.createObjectURL(blob);
                    element.attr('src', imgUrl);
                    window.URL.revokeObjectURL(imgUrl);
                }
            };

            scope.$watch(
                function() { return scope.$eval(attrs.blob); },
                function() { updateImage(); },
                true
            );
        };
    })
    .directive('setting', function() {
        return {
            restrict: 'A',
            require: '?ngModel',
            priority: 1,
            link: function(scope, element, attrs, ngModel) {
                if (!ngModel) {
                    return;
                }

                ngModel.$render = function() {
                    if (ngModel.$modelValue.value !== '') {
                        ngModel.$viewValue = ngModel.$modelValue.value;
                    }
                };
            }
        };
    })
;