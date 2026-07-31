package run.rs.rswikilink;

import org.springframework.stereotype.Component;
import run.halo.app.plugin.BasePlugin;
import run.halo.app.plugin.PluginContext;

/**
 * RS_WikiLink — Halo 编辑器 Wiki 内链插件
 */
@Component
public class RSWikiLinkPlugin extends BasePlugin {

    public RSWikiLinkPlugin(PluginContext pluginContext) {
        super(pluginContext);
    }

    @Override
    public void start() {
        System.out.println("RS_WikiLink 插件启动成功");
    }

    @Override
    public void stop() {
        System.out.println("RS_WikiLink 插件停止");
    }
}
