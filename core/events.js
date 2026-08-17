export default {
    topics: {},
    subscribe(topic, listener) {
        if (!this.topics[topic]) this.topics[topic] = [];
        this.topics[topic].push(listener);
    },
    publish(topic, data) {
        if (!this.topics[topic]) return;
        this.topics[topic].forEach(listener => {
            try { listener(data); } catch(e) { console.error(`[Event Cluster Error] Topic: ${topic} ->`, e); }
        });
    }
};
