let currentYear = new Date().getFullYear();
let reservoirsList = [];
let reservoirsData = {};
let allReservoirsData = [];
let waterUsageData = {};

function processSVG(svgContent, data) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const circles = svgDoc.querySelectorAll('circle[id^="Dam_S"]');

    circles.forEach(circle => {
        const id = circle.getAttribute('id');
        const match = id.match(/Dam_S(\d+)/);

        if (match) {
            const locationKey = match[1];
            const locationData = data[locationKey];

            if (locationData && locationData.data) {
                const dates = Object.keys(locationData.data).sort().reverse();
                if (dates.length > 0) {
                    const latestData = locationData.data[dates[0]];
                    const ctsi = latestData.find(item =>
                        item.itemname === '卡爾森指數' ||
                        item.itemname === '卡爾森優養指數' ||
                        item.itemname === '卡爾森優養指數(CTSI)'
                    );

                    if (ctsi) {
                        const value = parseFloat(ctsi.itemvalue);
                        let color = '#999';
                        if (value < 40) {
                            color = '#3498db';
                        } else if (value <= 50) {
                            color = '#27ae60';
                        } else {
                            color = '#f39c12';
                        }
                        circle.setAttribute('fill', color);
                        circle.setAttribute('stroke', '#fff');
                        circle.setAttribute('stroke-width', '2');
                        const title = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'title');
                        title.textContent = `測站 ${locationKey}\n卡爾森指數: ${value}\n日期: ${dates[0]}`;
                        circle.appendChild(title);
                    }
                }
            }
        }
    });

    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgDoc);
}

async function loadWaterUsageData(year) {
    try {
        const response = await fetch(`data/${year}.csv`);
        if (!response.ok) return;

        const csvText = await response.text();
        const lines = csvText.trim().split('\n');

        waterUsageData = {};

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    parts.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            parts.push(current);

            if (parts.length >= 5) {
                const name = parts[0];
                const agriculture = parseFloat(parts[2].replace(/,/g, '').replace(/-00/g, '0'));
                const domestic = parseFloat(parts[3].replace(/,/g, '').replace(/-00/g, '0'));
                const industrial = parseFloat(parts[4].replace(/,/g, '').replace(/-00/g, '0'));

                waterUsageData[name] = {
                    agriculture: agriculture,
                    domestic: domestic,
                    industrial: industrial
                };
            }
        }
    } catch (error) {
        console.log('Water usage data not available for year:', year);
    }
}

async function loadReservoirs(year) {
    try {
        document.getElementById('loading').classList.add('show');
        await loadWaterUsageData('2024');

        const response = await fetch(`data/${year}/list.json`);
        reservoirsList = await response.json();

        reservoirsData = {};
        allReservoirsData = [];
        const promises = reservoirsList.map(async (reservoir) => {
            try {
                const dataResponse = await fetch(`data/${year}/${reservoir}.json`);
                const data = await dataResponse.json();
                reservoirsData[reservoir] = data;
                let svgContent = null;
                try {
                    const svgResponse = await fetch(`images/${reservoir}.svg`);
                    if (svgResponse.ok) {
                        svgContent = await svgResponse.text();
                        svgContent = processSVG(svgContent, data);
                    }
                } catch (error) {
                    console.log(`SVG not found for ${reservoir}`);
                }

                allReservoirsData.push({
                    name: reservoir,
                    data: data,
                    svg: svgContent
                });

                return data;
            } catch (error) {
                console.error(`Error loading ${reservoir}:`, error);
                return null;
            }
        });

        await Promise.all(promises);
        allReservoirsData.sort((a, b) => {
            let latestDateA = null;
            const locationKeysA = Object.keys(a.data).filter(key => key !== 'name' && key !== 'svg');
            locationKeysA.forEach(locationKey => {
                const locationData = a.data[locationKey];
                if (locationData.data && Object.keys(locationData.data).length > 0) {
                    const dates = Object.keys(locationData.data).sort().reverse();
                    if (!latestDateA || dates[0] > latestDateA) {
                        latestDateA = dates[0];
                    }
                }
            });
            let latestDateB = null;
            const locationKeysB = Object.keys(b.data).filter(key => key !== 'name' && key !== 'svg');
            locationKeysB.forEach(locationKey => {
                const locationData = b.data[locationKey];
                if (locationData.data && Object.keys(locationData.data).length > 0) {
                    const dates = Object.keys(locationData.data).sort().reverse();
                    if (!latestDateB || dates[0] > latestDateB) {
                        latestDateB = dates[0];
                    }
                }
            });
            if (!latestDateA && !latestDateB) return 0;
            if (!latestDateA) return 1;
            if (!latestDateB) return -1;
            return latestDateB.localeCompare(latestDateA);
        });
        renderReservoirsGrid(allReservoirsData);

        document.getElementById('loading').classList.remove('show');
    } catch (error) {
        console.error('Error loading reservoirs:', error);
        document.getElementById('loading').classList.remove('show');
        alert('載入資料失敗，請稍後再試');
    }
}

function renderReservoirsGrid(reservoirs) {
    const grid = document.getElementById('reservoirsGrid');
    grid.innerHTML = '';
    if (reservoirs.length === 0) {
        grid.innerHTML = '<div class="no-data">找不到符合的水庫資料</div>';
        return;
    }
    reservoirs.forEach(reservoir => {
        const card = document.createElement('div');
        card.className = 'reservoir-card';
        card.onclick = () => {
            updateHash(currentYear, reservoir.name);
            showReservoirDetail(reservoir);
        };
        let cardHTML = `<h5>${reservoir.name}</h5>`;
        if (reservoir.svg) {
            cardHTML += `<div class="reservoir-svg">${reservoir.svg}</div>`;
        } else {
            cardHTML += `<div class="reservoir-svg"><div class="no-data">無圖形資料</div></div>`;
        }
        cardHTML += '<div class="reservoir-info">';
        const usageData = waterUsageData[reservoir.name];
        if (usageData && (usageData.agriculture > 0 || usageData.domestic > 0 || usageData.industrial > 0)) {
            if (usageData.agriculture > 0) {
                cardHTML += `<div class="info-item"><span class="label">農業用水</span><span>${usageData.agriculture.toLocaleString()} 萬噸</span></div>`;
            }
            if (usageData.domestic > 0) {
                cardHTML += `<div class="info-item"><span class="label">生活用水</span><span>${usageData.domestic.toLocaleString()} 萬噸</span></div>`;
            }
            if (usageData.industrial > 0) {
                cardHTML += `<div class="info-item"><span class="label">工業用水</span><span>${usageData.industrial.toLocaleString()} 萬噸</span></div>`;
            }
        }
        const locationKeys = Object.keys(reservoir.data).filter(key => key !== 'name' && key !== 'svg');
        let hasData = false;
        if (locationKeys.length > 0) {
            const locationData = reservoir.data[locationKeys[0]];

            if (locationData.data && Object.keys(locationData.data).length > 0) {
                const dates = Object.keys(locationData.data).sort().reverse();
                const latestDate = dates[0];
                const latestData = locationData.data[latestDate];
                const ctsi = latestData.find(item => item.itemname === '卡爾森指數' || item.itemname === '卡爾森優養指數' || item.itemname === '卡爾森優養指數(CTSI)');
                const ph = latestData.find(item => item.itemname === 'pH');
                if (ctsi) {
                    cardHTML += `<div class="info-item"><span class="label">卡爾森指數</span><span>${ctsi.itemvalue}</span></div>`;
                    hasData = true;
                }
                if (ph) {
                    cardHTML += `<div class="info-item"><span class="label">pH值</span><span>${ph.itemvalue}</span></div>`;
                    hasData = true;
                }
                if (hasData) {
                    cardHTML += `<div class="info-item"><span class="label">更新日期</span><span>${latestDate}</span></div>`;
                }
            }
        }
        if (!hasData && !usageData) {
            cardHTML += '<div class="no-data">目前無監測資料</div>';
        }
        cardHTML += '</div>';
        card.innerHTML = cardHTML;
        grid.appendChild(card);
    });
}

let currentReservoirData = null;
let usageChartInstance = null;
let itemChartInstances = {};
let chartIdCounter = 0;
let chartClickInProgress = false;

function showReservoirDetail(reservoir) {
    const modal = document.getElementById('detailModal');
    const modalBody = document.getElementById('modalBody');

    if (reservoirMap) {
        reservoirMap.remove();
        reservoirMap = null;
    }
    mapInitialized = false;
    mapMarkers = {};
    Object.values(itemChartInstances).forEach(chart => {
        if (chart) {
            try {
                chart.destroy();
            } catch (e) {
                console.error('Error destroying chart:', e);
            }
        }
    });
    itemChartInstances = {};
    currentReservoirData = reservoir;
    let html = `<h2 style="color: #667eea; margin-bottom: 20px; text-align: center;">${reservoir.name} (${currentYear})</h2>`;
    const usageData = waterUsageData[reservoir.name];
    if (usageData && (usageData.agriculture > 0 || usageData.domestic > 0 || usageData.industrial > 0)) {
        html += `<div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
      <h5 style="text-align: center; color: #667eea; margin-bottom: 15px;">供水用途分布</h5>
      <div style="display: flex; justify-content: center; align-items: center; gap: 20px; flex-wrap: wrap;">
        <canvas id="usageChart" style="max-width: 250px; max-height: 250px;"></canvas>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div><span style="display: inline-block; width: 20px; height: 20px; background: #27ae60; margin-right: 8px;"></span><strong>農業用水:</strong> ${usageData.agriculture.toLocaleString()} 萬噸</div>
          <div><span style="display: inline-block; width: 20px; height: 20px; background: #3498db; margin-right: 8px;"></span><strong>生活用水:</strong> ${usageData.domestic.toLocaleString()} 萬噸</div>
          <div><span style="display: inline-block; width: 20px; height: 20px; background: #f39c12; margin-right: 8px;"></span><strong>工業用水:</strong> ${usageData.industrial.toLocaleString()} 萬噸</div>
        </div>
      </div>
    </div>`;
    }
    html += `<div class="view-tabs">
    <button class="view-tab-button active" data-view="svg">SVG 圖形</button>
    <button class="view-tab-button" data-view="map">地理位置</button>
  </div>`;
    html += `<div class="view-content active" id="svgView">`;
    if (reservoir.svg) {
        html += `<div class="modal-svg" id="modalSvg">${reservoir.svg}</div>`;
    }
    html += `</div>`;
    html += `<div class="view-content" id="mapView">`;
    html += `<div id="modalMap" class="modal-map"></div>`;
    html += `</div>`;
    const locationKeys = Object.keys(reservoir.data).filter(key => key !== 'name' && key !== 'svg');
    let hasData = false;
    let allDates = [];

    if (locationKeys.length > 0) {
        html += `<h4 style="color: #28a745; margin-top: 20px;">監測站資料</h4>`;
        if (locationKeys.length > 1) {
            html += '<div class="tabs-container">';
            html += '<div class="tabs-nav">';

            locationKeys.forEach((locationKey, index) => {
                const activeClass = index === 0 ? 'active' : '';
                html += `<button class="tab-button ${activeClass}" data-tab="tab-${locationKey}">測站 ${locationKey}</button>`;
            });

            html += '</div>';
        }
        locationKeys.forEach((locationKey, index) => {
            const locationData = reservoir.data[locationKey];

            if (locationData.data && Object.keys(locationData.data).length > 0) {
                const dates = Object.keys(locationData.data).sort().reverse();
                allDates = allDates.concat(dates);
                const latestDate = dates[0];

                const activeClass = index === 0 ? 'active' : '';

                if (locationKeys.length > 1) {
                    html += `<div class="tab-content ${activeClass}" id="tab-${locationKey}">`;
                }
                html += '<div class="station-info">';
                html += `<p><strong>測站編號：</strong>${locationKey}</p>`;
                html += `<p><strong>最新更新：</strong>${latestDate}</p>`;
                html += `<p><strong>資料筆數：</strong>${dates.length} 筆</p>`;
                if (locationData.twd97lon && locationData.twd97lat) {
                    html += `<p><strong>座標：</strong>${locationData.twd97lat}, ${locationData.twd97lon}</p>`;
                }
                html += '</div>';
                if (dates.length > 1) {
                    html += '<div class="tabs-container" style="margin-top: 15px;">';
                    html += '<div class="tabs-nav">';

                    dates.forEach((date, dateIndex) => {
                        const activeClass = dateIndex === 0 ? 'active' : '';
                        const dateLabel = dateIndex === 0 ? `最新 ${date}` : date;
                        html += `<button class="tab-button date-tab ${activeClass}" data-tab="date-${locationKey}-${dateIndex}">${dateLabel}</button>`;
                    });

                    html += '</div>';
                }
                dates.forEach((date, dateIndex) => {
                    const dateData = locationData.data[date];
                    const activeClass = dateIndex === 0 ? 'active' : '';

                    if (dates.length > 1) {
                        html += `<div class="tab-content ${activeClass}" id="date-${locationKey}-${dateIndex}">`;
                    } else {
                        html += `<div style="margin-top: 15px;">`;
                    }

                    const measurements = {};
                    dateData.forEach(item => {
                        if (!measurements[item.itemname]) {
                            measurements[item.itemname] = [];
                        }
                        measurements[item.itemname].push(item);
                    });

                    html += '<table class="data-table">';
                    html += '<thead><tr><th>監測項目</th><th>數值</th><th>單位</th><th>採樣深度</th></tr></thead>';
                    html += '<tbody>';

                    Object.entries(measurements).forEach(([name, items]) => {
                        items.forEach(item => {
                            const depthKey = item.sampledepth || 'default';
                            const layerKey = item.samplelayer || 'default';
                            html += `<tr class="data-row" data-location="${locationKey}" data-item="${item.itemname}" data-depth="${depthKey}" data-layer="${layerKey}" data-unit="${item.itemunit}">
                <td><strong>${item.itemname}</strong></td>
                <td>${item.itemvalue}</td>
                <td>${item.itemunit}</td>
                <td>${item.sampledepth || '-'} ${item.samplelayer || ''}</td>
              </tr>`;
                        });
                    });

                    html += '</tbody></table>';
                    html += '</div>';
                });

                if (dates.length > 1) {
                    html += '</div>';
                }

                if (locationKeys.length > 1) {
                    html += '</div>';
                }

                hasData = true;
            }
        });

        if (locationKeys.length > 1) {
            html += '</div>';
        }

        if (allDates.length > 1) {
            const uniqueDates = [...new Set(allDates)].sort().reverse();
            html += `<div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
        <strong>歷史資料：</strong><br>
        共有 ${uniqueDates.length} 筆監測資料<br>
        最早：${uniqueDates[uniqueDates.length - 1]}<br>
        最新：${uniqueDates[0]}
      </div>`;
        }
    }

    if (!hasData) {
        html += '<div class="no-data" style="margin-top: 20px; padding: 30px;">目前無監測資料</div>';
    }

    modalBody.innerHTML = html;
    modal.classList.add('show');

    if (usageData && (usageData.agriculture > 0 || usageData.domestic > 0 || usageData.industrial > 0)) {
        setTimeout(() => {
            const canvas = document.getElementById('usageChart');
            if (canvas) {
                if (usageChartInstance) {
                    usageChartInstance.destroy();
                }

                const ctx = canvas.getContext('2d');
                const total = usageData.agriculture + usageData.domestic + usageData.industrial;

                const chartData = [];
                const labels = [];
                const colors = [];

                if (usageData.agriculture > 0) {
                    const percent = ((usageData.agriculture / total) * 100).toFixed(1);
                    chartData.push(usageData.agriculture);
                    labels.push(`農業用水 (${percent}%)`);
                    colors.push('#27ae60');
                }
                if (usageData.domestic > 0) {
                    const percent = ((usageData.domestic / total) * 100).toFixed(1);
                    chartData.push(usageData.domestic);
                    labels.push(`生活用水 (${percent}%)`);
                    colors.push('#3498db');
                }
                if (usageData.industrial > 0) {
                    const percent = ((usageData.industrial / total) * 100).toFixed(1);
                    chartData.push(usageData.industrial);
                    labels.push(`工業用水 (${percent}%)`);
                    colors.push('#f39c12');
                }

                usageChartInstance = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: chartData,
                            backgroundColor: colors,
                            borderColor: '#fff',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const label = context.label || '';
                                        const value = context.parsed.toLocaleString();
                                        return `${label}: ${value} 萬噸`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }, 100);
    }

    setTimeout(() => {
        const viewButtons = document.querySelectorAll('.view-tab-button');
        viewButtons.forEach(button => {
            button.addEventListener('click', function() {
                const view = this.getAttribute('data-view');
                switchView(view, reservoir, locationKeys);
            });
        });

        const svgContainer = document.getElementById('modalSvg');
        if (svgContainer) {
            const circles = svgContainer.querySelectorAll('circle[id^="Dam_S"]');
            circles.forEach(circle => {
                circle.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = this.getAttribute('id');
                    const match = id.match(/Dam_S(\d+)/);
                    if (match) {
                        const locationKey = match[1];
                        moveMarkToCircle(svgContainer, circle);
                        activateTab(locationKey);
                    }
                });
            });
        }

        const tabButtons = document.querySelectorAll('.tab-button:not(.date-tab)');
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const tabId = this.getAttribute('data-tab');
                const locationKey = tabId.replace('tab-', '');
                activateTabByButton(this);
                const circle = document.querySelector(`#modalSvg circle[id="Dam_S${locationKey}"]`);
                if (circle) {
                    moveMarkToCircle(document.getElementById('modalSvg'), circle);
                }
            });
        });

        const dateTabButtons = document.querySelectorAll('.tab-button.date-tab');
        dateTabButtons.forEach(button => {
            button.addEventListener('click', function() {
                activateTabByButton(this);
            });
        });

        const dataRows = document.querySelectorAll('.data-row');
        dataRows.forEach(row => {
            row.addEventListener('click', function() {
                const locationKey = this.getAttribute('data-location');
                const itemName = this.getAttribute('data-item');
                const depth = this.getAttribute('data-depth');
                const layer = this.getAttribute('data-layer');
                const unit = this.getAttribute('data-unit');
                showItemChart(locationKey, itemName, depth, layer, unit, this);
            });
        });
    }, 100);
}

function showItemChart(locationKey, itemName, depth, layer, unit, clickedRow) {
    if (chartClickInProgress) return;
    chartClickInProgress = true;
    setTimeout(() => {
        chartClickInProgress = false;
    }, 500);

    if (!currentReservoirData) return;

    const locationData = currentReservoirData.data[locationKey];
    if (!locationData || !locationData.data) return;
    const existingChart = clickedRow.nextElementSibling;
    if (existingChart && existingChart.classList.contains('chart-row')) {
        const existingChartId = existingChart.getAttribute('data-chart-id');
        if (existingChartId && itemChartInstances[existingChartId]) {
            itemChartInstances[existingChartId].destroy();
            delete itemChartInstances[existingChartId];
        }
        existingChart.remove();
        return;
    }

    const chartId = `chart-${chartIdCounter++}-${locationKey}-${itemName.replace(/[^a-zA-Z0-9]/g, '')}`;
    const dates = Object.keys(locationData.data).sort();
    const chartData = [];

    dates.forEach(date => {
        const dateData = locationData.data[date];
        const item = dateData.find(d => {
            const itemDepth = d.sampledepth || 'default';
            const itemLayer = d.samplelayer || 'default';
            return d.itemname === itemName && itemDepth === depth && itemLayer === layer;
        });
        if (item && item.itemvalue !== null && item.itemvalue !== undefined) {
            chartData.push({
                date: date,
                value: parseFloat(item.itemvalue)
            });
        }
    });

    if (chartData.length === 0) return;
    const depthLabel = depth !== 'default' ? ` (深度: ${depth}${layer !== 'default' ? ' ' + layer : ''})` : '';
    const chartTitle = `${itemName}${depthLabel} 歷史趨勢`;
    const chartRow = document.createElement('tr');
    chartRow.className = 'chart-row';
    chartRow.setAttribute('data-chart-id', chartId);
    chartRow.innerHTML = `
    <td colspan="4">
      <div class="chart-container">
        <span class="chart-close">&times;</span>
        <h6 style="margin: 0 0 15px 0; color: #667eea;">${chartTitle}</h6>
        <canvas id="${chartId}"></canvas>
      </div>
    </td>
  `;

    if (clickedRow && clickedRow.parentNode) {
        clickedRow.parentNode.insertBefore(chartRow, clickedRow.nextSibling);
    } else {
        console.error('Cannot insert chart row - no parent node');
        return;
    }

    const closeBtn = chartRow.querySelector('.chart-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            if (itemChartInstances[chartId]) {
                itemChartInstances[chartId].destroy();
                delete itemChartInstances[chartId];
            }
            chartRow.remove();
        });
    }

    const canvas = chartRow.querySelector('canvas');
    if (!canvas) {
        console.error('Canvas not found in chart row');
        return;
    }

    const ctx = canvas.getContext('2d');
    if (itemChartInstances[chartId]) {
        itemChartInstances[chartId].destroy();
    }

    try {
        itemChartInstances[chartId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => d.date),
                datasets: [{
                    label: `${itemName} (${unit})`,
                    data: chartData.map(d => d.value),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: unit
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '監測日期'
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating Chart.js instance:', error);
    }
}

let reservoirMap = null;
let mapMarkers = {};
let mapInitialized = false;

function switchView(view, reservoir, locationKeys) {
    document.querySelectorAll('.view-tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.view-tab-button[data-view="${view}"]`).classList.add('active');
    document.querySelectorAll('.view-content').forEach(content => content.classList.remove('active'));

    if (view === 'svg') {
        document.getElementById('svgView').classList.add('active');
    } else if (view === 'map') {
        document.getElementById('mapView').classList.add('active');
        if (!mapInitialized) {
            setTimeout(() => {
                initializeReservoirMap(reservoir, locationKeys);
                mapInitialized = true;
            }, 100);
        } else if (reservoirMap) {
            setTimeout(() => {
                reservoirMap.invalidateSize();
            }, 100);
        }
    }
}

function initializeReservoirMap(reservoir, locationKeys) {
    const mapContainer = document.getElementById('modalMap');
    if (!mapContainer) return;
    let bounds = [];
    let centerLat = 0;
    let centerLon = 0;
    let validLocations = 0;

    locationKeys.forEach(locationKey => {
        const locationData = reservoir.data[locationKey];
        if (locationData && locationData.twd97lat && locationData.twd97lon) {
            const lat = parseFloat(locationData.twd97lat);
            const lon = parseFloat(locationData.twd97lon);
            bounds.push([lat, lon]);
            centerLat += lat;
            centerLon += lon;
            validLocations++;
        }
    });

    if (validLocations === 0) return;

    centerLat /= validLocations;
    centerLon /= validLocations;
    reservoirMap = L.map('modalMap').setView([centerLat, centerLon], 14);
    L.tileLayer('https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://maps.nlsc.gov.tw/">國土測繪中心</a>',
        maxZoom: 18
    }).addTo(reservoirMap);

    locationKeys.forEach(locationKey => {
        const locationData = reservoir.data[locationKey];
        if (locationData && locationData.twd97lat && locationData.twd97lon) {
            const lat = parseFloat(locationData.twd97lat);
            const lon = parseFloat(locationData.twd97lon);
            let markerColor = '#999';
            if (locationData.data) {
                const dates = Object.keys(locationData.data).sort().reverse();
                if (dates.length > 0) {
                    const latestData = locationData.data[dates[0]];
                    const ctsi = latestData.find(item =>
                        item.itemname === '卡爾森指數' ||
                        item.itemname === '卡爾森優養指數' ||
                        item.itemname === '卡爾森優養指數(CTSI)'
                    );

                    if (ctsi) {
                        const value = parseFloat(ctsi.itemvalue);
                        if (value < 40) {
                            markerColor = '#3498db';
                        } else if (value <= 50) {
                            markerColor = '#27ae60';
                        } else {
                            markerColor = '#f39c12';
                        }
                    }
                }
            }

            const markerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: ${markerColor}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            const marker = L.marker([lat, lon], {
                icon: markerIcon
            }).addTo(reservoirMap);
            marker.bindPopup(`<strong>測站 ${locationKey}</strong><br>點擊切換至此測站資料`);

            marker.on('click', () => {
                activateTab(locationKey);
                const circle = document.querySelector(`#modalSvg circle[id="Dam_S${locationKey}"]`);
                if (circle) {
                    moveMarkToCircle(document.getElementById('modalSvg'), circle);
                }
            });

            mapMarkers[locationKey] = marker;
        }
    });

    if (bounds.length > 1) {
        reservoirMap.fitBounds(bounds, {
            padding: [50, 50]
        });
    }
}

function moveMarkToCircle(svgContainer, circle) {
    const svg = svgContainer.querySelector('svg');
    if (!svg) return;

    const markGroup = svg.querySelector('#Mark');
    if (!markGroup) return;

    const cx = parseFloat(circle.getAttribute('cx'));
    const cy = parseFloat(circle.getAttribute('cy'));

    const gMark = markGroup.querySelector('#gMark');
    if (gMark) {
        gMark.setAttribute('transform', `translate(${cx}, ${cy}) translate(-14, -14)`);
    }
}

function activateTab(locationKey) {
    const tabId = `tab-${locationKey}`;
    const tabButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    if (tabButton) {
        activateTabByButton(tabButton);
    }
}

function activateTabByButton(button) {
    const tabId = button.getAttribute('data-tab');
    const isDateTab = button.classList.contains('date-tab');

    if (isDateTab) {
        const parentContainer = button.closest('.tabs-container');
        if (parentContainer) {
            parentContainer.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            parentContainer.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        }
    } else {
        document.querySelectorAll('.tab-button:not(.date-tab)').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content[id^="tab-"]').forEach(content => content.classList.remove('active'));
    }

    button.classList.add('active');
    const tabContent = document.getElementById(tabId);
    if (tabContent) {
        tabContent.classList.add('active');
    }
}

document.getElementById('modalClose').addEventListener('click', function() {
    document.getElementById('detailModal').classList.remove('show');
    updateHash(currentYear, null);
});

document.getElementById('detailModal').addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.remove('show');
        updateHash(currentYear, null);
    }
});

document.getElementById('yearSelect').addEventListener('change', function(e) {
    const newYear = e.target.value;
    const oldHash = window.location.hash;
    updateHash(newYear, null);
    setTimeout(() => {
        if (window.location.hash === oldHash && newYear !== currentYear) {
            currentYear = newYear;
            document.getElementById('detailModal').classList.remove('show');
            loadReservoirs(currentYear).then(() => {
                const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
                if (searchTerm !== '') {
                    const filtered = allReservoirsData.filter(reservoir =>
                        reservoir.name.toLowerCase().includes(searchTerm)
                    );
                    renderReservoirsGrid(filtered);
                }
            });
        }
    }, 10);
});

document.getElementById('searchInput').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase().trim();

    if (searchTerm === '') {
        renderReservoirsGrid(allReservoirsData);
    } else {
        const filtered = allReservoirsData.filter(reservoir =>
            reservoir.name.toLowerCase().includes(searchTerm)
        );
        renderReservoirsGrid(filtered);
    }
});

function parseHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) {
        return {
            year: currentYear,
            reservoir: null
        };
    }

    const parts = hash.split('/');
    let parsedYear = currentYear;

    if (parts.length >= 1 && parts[0]) {
        const year = parts[0];
        if (['2019', '2020', '2021', '2022', '2023', '2024', '2025'].includes(year)) {
            parsedYear = year;
        }
    }

    return {
        year: parsedYear,
        reservoir: parts.length >= 2 ? decodeURIComponent(parts[1]) : null
    };
}

function updateHash(year, reservoir) {
    if (reservoir) {
        window.location.hash = `${year}/${encodeURIComponent(reservoir)}`;
    } else {
        window.location.hash = year;
    }
}

window.addEventListener('hashchange', function() {
    const params = parseHash();
    if (params.year !== currentYear) {
        currentYear = params.year;
        document.getElementById('yearSelect').value = currentYear;
        document.getElementById('detailModal').classList.remove('show');
        loadReservoirs(currentYear).then(() => {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
            if (searchTerm !== '') {
                const filtered = allReservoirsData.filter(reservoir =>
                    reservoir.name.toLowerCase().includes(searchTerm)
                );
                renderReservoirsGrid(filtered);
            }

            if (params.reservoir) {
                openReservoirByName(params.reservoir);
            }
        });
    } else if (params.reservoir) {
        openReservoirByName(params.reservoir);
    } else {
        document.getElementById('detailModal').classList.remove('show');
    }
});

function openReservoirByName(name) {
    const reservoir = allReservoirsData.find(r => r.name === name);
    if (reservoir) {
        showReservoirDetail(reservoir);
    }
}

const initialParams = parseHash();
if (initialParams.year) {
    currentYear = initialParams.year;
    document.getElementById('yearSelect').value = currentYear;
}
loadReservoirs(currentYear).then(() => {
    if (initialParams.reservoir) {
        openReservoirByName(initialParams.reservoir);
    }
});