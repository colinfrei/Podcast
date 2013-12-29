'use strict';

angular.module('podcasts.utilities', [])
    .service('utilities', function() {
        return {
            clean_url: function(url) {
                var cleanedUrl;

                if (url.substring(0, 4) != 'http') {
                    cleanedUrl = 'http://' + url;
                } else {
                    cleanedUrl = url;
                }

                return cleanedUrl;
            }
        };
    })
    .service('url', ['$window', function($window) {
        return {
            url: $window.URL || $window.webkitURL,
            createObjectUrl: function(data) {
                return this.url.createObjectURL(data);
            }
        };
    }])
    .service('xmlParser', ['$window', function($window) {
        return  {
            parse: function(data) {
                return angular.element(new $window.DOMParser().parseFromString(data, "text/xml"));
            }
        };
    }])
;
