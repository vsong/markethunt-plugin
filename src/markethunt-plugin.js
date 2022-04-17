// ==UserScript==
// @name         Markethunt plugin for Mousehunt
// @author       Program
// @namespace    https://greasyfork.org/en/users/886222-program
// @license      MIT
// @version      1.2.1
// @description  Adds a price chart and Markethunt integration to the MH marketplace screen.
// @resource     jq_confirm_css https://cdnjs.cloudflare.com/ajax/libs/jquery-confirm/3.3.2/jquery-confirm.min.css
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-confirm/3.3.2/jquery-confirm.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highcharts/9.3.2/highstock.min.js
// @include      https://www.mousehuntgame.com/*
// @grant        GM_addStyle
// @grant        GM_getResourceText
//
// ==/UserScript==

const sbImageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAARCAMAAAAMs7fIAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAMAUExURWlsaXV1cX17eyzRS1nA" +
      "dF7QclzQdHyipHTFjXTLi7KKa7SLbLqQa7uTcbmTd7mae76xes+idM2kftmrd+GpYeCqcOG2fuazeOa3fOW7fem5f/TEeIiDhY2Li46MipCJh5WQkJ6Xl6igoK+1sYzKm5LXqavcsa/W077d" +
      "wq3//7P//8uzntGniNCrgtGtidGujN21g9CxltO5mdi7m8O4uOe8jei7g97DqNTDu+/AiezAi+3Dj+zEj+XAle7DkO7FkO/Gk+/HlOjFmuzMnvHJh/LKjfHJk/HIlfPNkvXLm/XNnPfQiuDI" +
      "ruXJqeXTqOrXruzZtvHPpvLTp/bRpPbUpPbUpfbUp/XUqPfWqvfXrPjVo/jXq/nXrPHVtffatvjbs/rcsvnctvret/jgvcLKws7VzNrNwtrT1Mfozczk0M3t1Nfhy8n//9ns8db/89D//9n/" +
      "/9z//+He3P/kw/3mw/7mx//pxf7oyP/pyf7rzP/tz/fm0fDn3/7t1fvt3P/y3eHj7ufp7e3n5+jp9Oru/+zs+O3u/uLx5Of+/+n//+3////04//25v327P/55//47fDw8/b68fL///f5+fT4" +
      "//b8//X///n39/v48/z48v/78/379/v9//n///34+P/7+/38+P39+/z8/P7+/P7+/v7+/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALvc" +
      "lYYAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZdEVYdFNvZnR3YXJlAFBhaW50Lk5FVCB2My41LjVJivzgAAAA70lEQVQoU2NYig5AIjlzIezCdtYMsMh0dmVGBnkmlSwNTmY2sMgiBVk5JUUZ" +
      "DlWWTLWJnUARoBaQrskQnflAEa1JS5cC0YTmhobGCUAxhmmaOUs7lk5pm9o1tcWEP3UaUE3X0nlNRbnpKeragqKSRhDb+0UExMwcnT29oix1wCIFfdJ+QdnJxRVVZW7CYJFped5J8QExoSH+" +
      "VuKGEF2zPCKig90d7O2sJdIgIktdbcIiw8KdhHi4W6EiLlIGurxcfHq2phZQER99Y9/Y8tKKxEBzqEhCXEllbX1Pd111DVSkd8bM2YuXzF+6cMGcpUsBclSDbJTlCDAAAAAASUVORK5CYII=";

// chart vars
const UtcTimezone = "T00:00:00+00:00"

// style
const primaryLineColor = "#4f52aa";
const sbiLineColor = "#00c000"
const volumeColor = "#51cda0";

const eventBandColor = "#f2f2f2";
const eventBandFontColor = "#888888"; // recommend to have same or close color as yGridLineColor for visual clarity
const xGridLineColor = "#bbbbbb";
const yGridLineColor = "#aaaaaa";
const yGridLineColorLighter = "#dddddd";
const axisLabelColor = "#444444";
const crosshairColor = "#252525";

const chartFont = "tahoma";

var eventData = [];

function UtcIsoDateToMillis(dateStr) {
    return (new Date(dateStr + UtcTimezone)).getTime();
}

function formatSISuffix(num, decimalPlaces) {
    const suffixes = ["", "K", "M", "B"];
    let order = Math.max(Math.floor(Math.log(num) / Math.log(1000)), 0);
    if (order > suffixes.length - 1) {
        order = suffixes.length - 1;
    }
    let significand = num / Math.pow(1000, order);
    return significand.toFixed(decimalPlaces) + suffixes[order];
}

function eventBand(IsoStrFrom, IsoStrTo, labelText) {
    return {
        from: UtcIsoDateToMillis(IsoStrFrom),
        to: UtcIsoDateToMillis(IsoStrTo),
        color: eventBandColor,
        label: {
            text: labelText,
            rotation: 270,
            textAlign: 'right',
            y: 5, // pixels from top of chart
            x: 4, // fix slight centering issue
            style: {
                color: eventBandFontColor,
                fontSize: '12px',
                fontFamily: chartFont,
            },
        },
    }
}

function updateEventData() {
    $.getJSON("https://markethunt.vsong.ca/api/get_event_dates.php", function (response) {
        localStorage.markethuntEventDates = JSON.stringify(response);
        localStorage.markethuntEventDatesLastRetrieval = Date.now();
    });
}

function renderChartWithItemId(itemId, containerId) {
    itemId = Number(itemId);

    if (localStorage.markethuntEventDatesLastRetrieval !== undefined) {
        eventData = [];
        JSON.parse(localStorage.markethuntEventDates).forEach(event => eventData.push(eventBand(event[0], event[1], event[2])));

        if (Date.now() - Number(localStorage.markethuntEventDatesLastRetrieval) > 2 * 86400 * 1000) {
            updateEventData();
        }
    } else {
        updateEventData();
    }

    function renderChart(response) {
        // set stock data HUD
        if (response.data.length > 0) {
            const newestPrice = response.data[response.data.length - 1];
            const utcTodayMillis = UtcIsoDateToMillis(new Date().toISOString().substring(0, 10));

            const priceDisplay = document.getElementById("infoboxPrice");
            const sbIndexDisplay = document.getElementById("infoboxSbPrice");
            const tradeVolDisplay = document.getElementById("infoboxTradevol");
            const goldVolDisplay = document.getElementById("infoboxGoldvol");
            const weeklyVolDisplay = document.getElementById("infobox7dTradevol");
            const weeklyGoldVolDisplay = document.getElementById("infobox7dGoldvol");

            // set gold price
            priceDisplay.innerHTML = newestPrice.price.toLocaleString();

            // set sb price
            try {
                let sbiText = '--';
                if (newestPrice.sb_index >= 100) {
                    sbiText = Math.round(newestPrice.sb_index).toLocaleString();
                /*} else if (newestPrice.sb_index >= 10) {
                    sbiText = newestPrice.sb_index.toFixed(1).toLocaleString();*/
                } else {
                    sbiText = newestPrice.sb_index.toFixed(2).toLocaleString();
                }
                sbIndexDisplay.innerHTML = sbiText;
            } catch (e) {
                // do nothing
            }

            // set yesterday's trade volume
            let volText = '0';
            if (utcTodayMillis - UtcIsoDateToMillis(newestPrice.date) <= 86400 * 1000 && newestPrice.volume !== null) {
                volText = newestPrice.volume.toLocaleString();
            }
            tradeVolDisplay.innerHTML = volText;

            // set yesterday's gold volume
            let goldVolText = '0';
            if (utcTodayMillis - UtcIsoDateToMillis(newestPrice.date) <= 86400 * 1000 && newestPrice.volume !== null) {
                goldVolText = formatSISuffix(newestPrice.volume * newestPrice.price, 2);
            }
            goldVolDisplay.innerHTML = goldVolText;

            // set last week's trade volume
            let weeklyVolText = response.data.reduce(function(sum, dataPoint) {
                if (utcTodayMillis - UtcIsoDateToMillis(dataPoint.date) <= 7 * 86400 * 1000) {
                    return sum + (dataPoint.volume !== null ? dataPoint.volume : 0);
                } else {
                    return sum;
                }
            }, 0);
            weeklyVolDisplay.innerHTML = weeklyVolText.toLocaleString();

            // set last week's gold volume
            let weeklyGoldVol = response.data.reduce(function(sum, dataPoint) {
                if (utcTodayMillis - UtcIsoDateToMillis(dataPoint.date) <= 7 * 86400 * 1000) {
                    return sum + (dataPoint.volume !== null ? dataPoint.volume * dataPoint.price : 0);
                } else {
                    return sum;
                }
            }, 0);
            weeklyGoldVolDisplay.innerHTML = (weeklyGoldVol === 0) ? '0' : formatSISuffix(weeklyGoldVol, 2);
        }

        // process data for highcharts
        var daily_prices = [];
        var daily_trade_volume = [];
        var sbi = [];
        for (var i = 0; i < response.data.length; i++) {
            daily_prices.push([
                UtcIsoDateToMillis(response.data[i].date),
                Number(response.data[i].price)
            ]);
            daily_trade_volume.push([
                UtcIsoDateToMillis(response.data[i].date),
                Number(response.data[i].volume)
            ]);
            sbi.push([
                UtcIsoDateToMillis(response.data[i].date),
                Number(response.data[i].sb_index)
            ]);
        }

        Highcharts.setOptions({
            chart: {
                style: {
                    fontFamily: chartFont,
                },
                spacingLeft: 0,
                spacingRight: 5,
                spacingTop: 7,
                spacingBottom: 6,
            },
            lang: {
                rangeSelectorZoom :""
            },
            plotOptions: {
                series: {
                    //animation: false,
                    dataGrouping: {
                        enabled: (itemId == 114114) ? true : false,
                        units: [['day', [1]], ['week', [1]]],
                        groupPixelWidth: 2,
                    },
                    showInLegend: true,
                },
            },
            xAxis: {
                // lineColor: '#555',
                tickColor: xGridLineColor,
                // gridLineWidth: 1,
                gridLineColor: xGridLineColor,
                labels: {
                    style: {
                        color: axisLabelColor,
                        fontSize: '11px',
                    }
                }
            },
            yAxis: {
                gridLineColor: yGridLineColor,
                labels: {
                    style: {
                        color: axisLabelColor,
                        fontSize: '11px',
                    },
                    y: 3,
                }
            }
        });

        // Create the chart
        var chart = new Highcharts.stockChart(containerId, {
            // must keep scrollbar enabled for dynamic scrolling, so hide the scrollbar instead
            scrollbar: {
                height: 0,
                buttonArrowColor: "#ffffff00",
            },
            title: {
                enabled: false,
            },
            credits: {
                enabled: false,
            },
            rangeSelector: {
                buttons: [
                    {
                        type: 'month',
                        count: 1,
                        text: '1M'
                    }, {
                        type: 'month',
                        count: 3,
                        text: '3M'
                    }, {
                        type: 'month',
                        count: 6,
                        text: '6M'
                    }, {
                        type: 'year',
                        count: 1,
                        text: '1Y',
                    }, {
                        type: 'all',
                        text: 'All'
                    },
                ],
                buttonPosition: {
                    y: 5,
                },
                inputEnabled: false,
                labelStyle: {
                    color: axisLabelColor,
                },
                //buttonPosition: {align: 'right'},
                verticalAlign: 'top',
                //dropdown: 'always',
                //floating: true,
                selected: 3,
                x: -5.5,
            },
            legend: {
                enabled: true,
                align: 'right',
                verticalAlign: 'top',
                y: -23,
                padding: 0,
                itemStyle: {
                    color: '#000000',
                    fontSize: "13px",
                },
            },
            tooltip: {
                animation: false,
                shared: true,
                split: false,
                headerFormat: '<span style="font-size: 11px; font-weight: bold">{point.key}</span><br/>',
                xDateFormat: '%b %e, %Y',
                backgroundColor: 'rgba(255, 255, 255, 1)',
                hideDelay: 0, // makes tooltip feel more responsive when crossing gap between plots
                style: {
                    color: '#000000',
                    fontSize: '11px',
                    fontFamily: chartFont,
                }
            },
            series: [
                {
                    name: 'Average price',
                    id: 'dailyPrice',
                    data: daily_prices,
                    lineWidth: 1.5,
                    states: {
                        hover: {
                            lineWidthPlus: 0,
                            halo: false, // disable translucent halo on marker hover
                        }
                    },
                    yAxis: 0,
                    color: primaryLineColor,
                    marker: {
                        states: {
                            hover: {
                                lineWidth: 0,
                            }
                        },
                    },
                    point: {
                        events: {
                            click: function() {
                                addToWatchlistModal(parseInt(this.y));
                            },
                        },
                    },
                    tooltip: {
                        pointFormatter: function() {
                            return `<span style="color:${this.color}">\u25CF</span>`
                                + ` ${this.series.name}:`
                                + ` <b>${this.y.toLocaleString()}g</b><br/>`;
                        },
                    },
                    zIndex: 1,
                }, {
                    name: 'Volume',
                    type: 'column',
                    data: daily_trade_volume,
                    showInLegend: false,
                    pointPadding: 0, // disable point and group padding to simulate column area chart
                    groupPadding: 0,
                    yAxis: 2,
                    color: volumeColor,
                    tooltip: {
                        pointFormatter: function() {
                            let volumeAmtText = this.y !== 0 ? this.y.toLocaleString() : 'n/a';
                            return `<span style="color:${this.color}">\u25CF</span>`
                                    + ` ${this.series.name}:`
                                    + ` <b>${volumeAmtText}</b><br/>`;
                        },
                    },
                    zIndex: 0,
                }, {
                    name: 'SB Index',
                    id: 'sbi',
                    data: sbi,
                    visible: false,
                    lineWidth: 1.5,
                    states: {
                        hover: {
                            lineWidthPlus: 0,
                            halo: false, // disable translucent halo on marker hover
                        }
                    },
                    yAxis: 1,
                    color: sbiLineColor,
                    marker: {
                        states: {
                            hover: {
                                lineWidth: 0,
                            }
                        },
                    },
                    tooltip: {
                        pointFormatter: function() {
                            if (this.y >= 1000) {
                                var sbiText = Math.round(this.y).toLocaleString();
                            } else if (this.y >= 100) {
                                var sbiText = this.y.toFixed(1).toLocaleString();
                            } else if (this.y >= 10) {
                                var sbiText = this.y.toFixed(2).toLocaleString();
                            } else {
                                var sbiText = this.y.toFixed(3).toLocaleString();
                            }
                            return `<span style="color:${this.color}">\u25CF</span>`
                                + ` SB Index:`
                                + ` <b>${sbiText} SB</b><br/>`;
                        },
                    },
                    zIndex: 2,
                },
            ],
            yAxis: [
                {
                    //height: '80%',
                    // lineWidth: 1,
                    labels: {
                        formatter: function() {
                            return this.value.toLocaleString() + 'g';
                        },
                        x: -8,
                    },
                    showLastLabel: true, // show label at top of chart
                    crosshair: {
                        dashStyle: 'ShortDot',
                        color: crosshairColor,
                    },
                    opposite: false,
                    alignTicks: false, // disabled, otherwise autoranger will create too large a Y-window
                }, {
                    //height: '80%',
                    gridLineWidth: 0,
                    labels: {
                        formatter: function() {
                            return this.value.toLocaleString() + ' SB';
                        },
                        x: 5,
                    },
                    showLastLabel: true, // show label at top of chart
                    opposite: true,
                    alignTicks: false,
                }, {
                    top: '70%',
                    height: '30%',
                    offset: 0,
                    opposite: false,
                    tickPixelInterval: 35,
                    allowDecimals: false,
                    alignTicks: false,
                    visible: false,

            }],
            xAxis: {
                type: 'datetime',
                ordinal: false, // show continuous x axis if dates are missing
                plotBands: eventData,
                crosshair: {
                    dashStyle: 'ShortDot',
                    color: crosshairColor,
                },
                dateTimeLabelFormats:{
                    day: '%b %e',
                    week: '%b %e, \'%y',
                    month: '%b %Y',
                    year: '%Y'
                },
                tickPixelInterval: 120,
            },
            navigator: {
                height: 25,
                margin: 0,
                maskInside: false,
                enabled: false,
            }
        });
    }

    $.getJSON("https://markethunt.vsong.ca/api/stock_data/getjson.php?item_id=" + itemId, function (response) {
        renderChart(response);
    });
}

if (localStorage.markethuntEventDatesLastRetrieval === undefined) {
    updateEventData();
}

(function () {
    /**
     * [ Notes ]
     * innerText has poor retrieval perf, use textContent
     *   http://perfectionkills.com/the-poor-misunderstood-innerText/
     * Is there a better way to center scrollRow vertically within table?
     *   https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
     */

    MutationObserver =
        window.MutationObserver ||
        window.WebKitMutationObserver ||
        window.MozMutationObserver;

    // Only observe changes to the #overlayPopup element
    const observerTarget = document.querySelector("#overlayPopup");

    const observer = new MutationObserver(function () {

        // Check if the Marketplace interface is open
        if (observerTarget.querySelector(".marketplaceView")) {
            // detect item page and inject chart
            const backButton = observerTarget.querySelector("a.marketplaceView-breadcrumb");
            if (backButton) {
                const targetContainer = observerTarget.querySelector(
                    ".marketplaceView-item-description"
                );

                if (targetContainer && !observerTarget.querySelector("#chartArea")) {
                    // Disconnect and reconnect later to prevent mutation loop
                    observer.disconnect();

                    // Setup chart divs
                    const itemId = observerTarget.querySelector(".marketplaceView-item.view").getAttribute("data-item-id");
                    targetContainer.insertAdjacentHTML(
                        "beforebegin",
                        `<div id="chartArea" style="display: flex; padding: 0 20px 0 20px; height: 315px;">
                            <div id="highchartContainer" style="flex-grow: 1"></div>
                            <div id="markethuntInfobox" style="text-align: center; display: flex; flex-direction: column; padding: 34px 0 25px 5px">
                                <div class="marketplaceView-item-averagePrice infobox-stat infobox-small-spans infobox-striped">
                                    Trade volume:<br>
                                    <span id="infoboxTradevol">--</span><br>
                                    <span id="infoboxGoldvol" class="marketplaceView-goldValue">--</span>
                                </div>
                                <div class="marketplaceView-item-averagePrice infobox-stat infobox-small-spans">
                                    7-day trade volume:<br>
                                    <span id="infobox7dTradevol">--</span><br>
                                    <span id="infobox7dGoldvol" class="marketplaceView-goldValue">--</span>
                                </div>
                                <div style="flex-grow: 1"></div> <!-- spacer div -->
                                <div>
                                    <a class="markethunt-cross-link" href="https://markethunt.vsong.ca/watchlist.php?action=add_watch_item&item_id=${itemId}" target="_blank">[Add to Watchlist]</a><br>
                                    <a class="markethunt-cross-link" href="https://markethunt.vsong.ca/portfolio.php?action=add_position&item_id=${itemId}" target="_blank">[Add to Portfolio]</a><br>
                                    <a class="markethunt-cross-link" href="https://markethunt.vsong.ca/index.php?item_id=${itemId}" target="_blank">[View on Markethunt]</a>
                                </div>
                            </div>
                        </div>`);

                    const itemPriceContainer = observerTarget.querySelector(".marketplaceView-item-averagePrice");
                    itemPriceContainer.classList.add("infobox-stat");
                    itemPriceContainer.insertAdjacentHTML(
                        "beforeend",
                        `<br><span id="infoboxSbPrice" class="marketplaceView-sbValue">--</span><img style="vertical-align: bottom" src="${sbImageData}" />`
                    );

                    const itemPriceDisplay = itemPriceContainer.querySelector("span");
                    itemPriceDisplay.id = "infoboxPrice";

                    const infoBox = document.getElementById("markethuntInfobox");
                    infoBox.prepend(itemPriceContainer);

                    // Set infobox minimum width to prevent layout shifts, *then* reset price display
                    const infoBoxInitialWidth = $(infoBox).width();
                    infoBox.style.minWidth = `${infoBoxInitialWidth}px`;

                    itemPriceDisplay.innerHTML = "--";

                    // Render chart
                    renderChartWithItemId(itemId, "highchartContainer");

                    // Re-observe after mutation-inducing logic
                    observer.observe(observerTarget, {
                        childList: true,
                        subtree: true
                    });
                }
            }

            // detect history page and inject portfolio buttons
            const historyTab = observerTarget.querySelector("[data-tab=history].active");
            if (historyTab) {
                observer.disconnect();

                let rowElem = observerTarget.querySelectorAll(".marketplaceMyListings tr.buy");
                rowElem.forEach(function(row) {
                    if (!row.querySelector(".mousehuntActionButton.tiny.addPortfolio")) {
                        let itemElem = row.querySelector(".marketplaceView-itemImage");
                        const itemId = itemElem.getAttribute("data-item-id");

                        let qtyElem = row.querySelector("td.marketplaceView-table-numeric");
                        const qty = Number(qtyElem.innerText.replace(/\D/g, ''));

                        let priceElem = row.querySelector("td.marketplaceView-table-numeric .marketplaceView-goldValue");
                        const price = Number(priceElem.innerText.replace(/\D/g, ''));

                        let buttonContainer = row.querySelector("td.marketplaceView-table-actions");
                        let addPortfolioBtn = document.createElement("a");
                        addPortfolioBtn.href = `https://markethunt.vsong.ca/portfolio.php?action=add_position&item_id=${itemId}&add_qty=${qty}&add_mark=${price}`;
                        addPortfolioBtn.innerHTML = "<span>+ Portfolio</span>";
                        addPortfolioBtn.className = "mousehuntActionButton tiny addPortfolio";
                        addPortfolioBtn.target = "_blank";
                        addPortfolioBtn.style.display = "block";
                        addPortfolioBtn.style.marginTop = "2px";
                        buttonContainer.appendChild(addPortfolioBtn);
                    }
                });

                observer.observe(observerTarget, {
                    childList: true,
                    subtree: true
                });
            }
        }
    });

    // Initial observe
    observer.observe(observerTarget, {
        childList: true,
        subtree: true
    });

})();

const mp_css_overrides = `
.marketplaceView-item {
    padding-top: 10px;
}
.marketplaceView-item-content {
    padding-top: 10px;
    padding-bottom: 0px;
    min-height: 0px;
}
.marketplaceView-item-descriptionContainer {
    padding-bottom: 5px;
    padding-top: 5px;
}
.marketplaceView-item-averagePrice {
    margin-top: 5px;
}
.marketplaceView-item-footer {
    padding-top: 10px;
    padding-bottom: 10px;
}
.markethunt-cross-link {
    color: #0000dd;
    font-size: 10px;
}
.marketplaceView-item-averagePrice.infobox-stat {
    text-align: left;
    margin-bottom: 14px;
    white-space: nowrap;
}
.marketplaceView-item-leftBlock .marketplaceHome-block-viewAll {
    margin-top: 5px;
}
.infobox-striped {
}
.infobox-small-spans span {
    font-size: 11px;
}
.infobox-small-spans .marketplaceView-goldValue::after {
    width: 17px;
    height: 13px;
}
`;

$(document).ready(function() {
    GM_addStyle(GM_getResourceText("jq_confirm_css"));
    GM_addStyle(mp_css_overrides);
    addTouchPoint();
});

function addTouchPoint() {
    if ($('.invImport').length == 0) {
        const invPages = $('.inventory .torn_pages');
        //Inventory History Button
        const invImportElem = document.createElement('li');
        invImportElem.classList.add('crafting');
        invImportElem.classList.add('invImport');
        const invImportBtn = document.createElement('a');
        invImportBtn.href = "#";
        invImportBtn.innerText = "Export to Markethunt";
        invImportBtn.onclick = function () {
            onInvImportClick();
        };
        const icon = document.createElement("div");
        icon.className = "icon";
        invImportBtn.appendChild(icon);
        invImportElem.appendChild(invImportBtn);
        $(invImportElem).insertAfter(invPages);
    }
}

function submitInv() {
    if (!document.forms["import-form"].reportValidity()) {
        return;
    }

    const itemsToGet = ['weapon','base', 'trinket', 'bait', 'skin', 'crafting_item','convertible', 'potion', 'stat','collectible','map_piece','adventure']; //future proof this to allow for exclusions
    let itemsArray = [];
    hg.utils.UserInventory.getItemsByClass(itemsToGet,true,function(data) {
        data.forEach(function(arrayItem, index) {
            itemsArray[index] = [arrayItem.item_id, arrayItem.quantity];
        });

        $('#import-data').val(JSON.stringify(itemsArray));
        document.forms["import-form"].submit();
    })
}

function onInvImportClick(){
    $.dialog({
        title: 'Export inventory to Markethunt',
        content: `
        <form id="import-form" name="import-form" action="https://markethunt.vsong.ca/import_portfolio.php" method="post" target="_blank">
                <label for="import-portfolio-name">Portfolio name: <span style="color: red">*</span></label>
                <input type="text" id="import-portfolio-name" name="import-portfolio-name" required pattern=".+"/>
                <input type="hidden" id="import-data" name="import-data"/>
        </form>
        <div id="export-dialog-buttons" class="jconfirm-buttons" style="float: none; margin-top: 10px;"><button type="button" class="btn btn-primary">Export</button></div>`,
        boxWidth: '600px',
        useBootstrap: false,
        closeIcon: true,
        draggable: true,
        onOpen: function(){
            $('#import-portfolio-name').val('Portfolio ' + (new Date()).toISOString().substring(0, 10));
            this.$content.find('button').click(function(){
                submitInv();
            });
        }
    })
}