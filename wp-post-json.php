<?php
/**
 * Plugin Name: Clean Post API - Rev
 * Description: Clean REST API
 * Version: 1.1
 * Author: Revelation A.F
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', function () {

    // GET /wp-json/clean-api/v1/posts
    register_rest_route('clean-api/v1', '/posts', [
        'methods' => 'GET',
        'callback' => 'clean_api_get_posts',
        'permission_callback' => '__return_true',
        'args' => [
            'page' => [
                'default' => 1,
                'sanitize_callback' => 'absint',
            ],
            'per_page' => [
                'default' => 10,
                'sanitize_callback' => 'absint',
            ],
        ],
    ]);

    // GET /wp-json/clean-api/v1/posts/15
    register_rest_route('clean-api/v1', '/posts/(?P<id>\d+)', [
        'methods' => 'GET',
        'callback' => 'clean_api_get_post',
        'permission_callback' => '__return_true',
    ]);

    // GET /wp-json/clean-api/v1/posts/slug/hello-world
    register_rest_route('clean-api/v1', '/posts/slug/(?P<slug>[a-zA-Z0-9-_]+)', [
        'methods' => 'GET',
        'callback' => 'clean_api_get_post_by_slug',
        'permission_callback' => '__return_true',
    ]);

});

function clean_api_format_post($post)
{
    return [
        'id' => $post->ID,
        'title' => get_the_title($post),
        'slug' => $post->post_name,
        'excerpt' => get_the_excerpt($post),
        'content' => apply_filters('the_content', $post->post_content),
        'image' => get_the_post_thumbnail_url($post->ID, 'full') ?: '',
        'author' => get_the_author_meta('display_name', $post->post_author),
        'date' => get_the_date('Y-m-d', $post),
        'modified' => get_the_modified_date('Y-m-d', $post),
        'categories' => wp_get_post_categories($post->ID, ['fields' => 'names']),
        'tags' => wp_get_post_tags($post->ID, ['fields' => 'names']),
        'url' => get_permalink($post),
    ];
}

function clean_api_get_posts($request)
{
    $page = max(1, (int) $request->get_param('page'));

    $per_page = (int) $request->get_param('per_page');

    if ($per_page < 1) {
        $per_page = 10;
    }

    if ($per_page > 50) {
        $per_page = 50;
    }

    $query = new WP_Query([
        'post_type' => 'post',
        'post_status' => 'publish',
        'posts_per_page' => $per_page,
        'paged' => $page,
        'orderby' => 'date',
        'order' => 'DESC',
    ]);

    $posts = [];

    foreach ($query->posts as $post) {
        $posts[] = clean_api_format_post($post);
    }

    return rest_ensure_response([
        'success' => true,
        'pagination' => [
            'page' => $page,
            'per_page' => $per_page,
            'total_posts' => (int) $query->found_posts,
            'total_pages' => (int) $query->max_num_pages,
            'has_next' => $page < $query->max_num_pages,
            'has_prev' => $page > 1,
        ],
        'posts' => $posts,
    ]);
}

function clean_api_get_post($request)
{
    $post = get_post($request['id']);

    if (!$post || $post->post_status !== 'publish') {
        return new WP_Error(
            'not_found',
            'Post not found',
            ['status' => 404]
        );
    }

    return rest_ensure_response([
        'success' => true,
        'post' => clean_api_format_post($post),
    ]);
}

function clean_api_get_post_by_slug($request)
{
    $posts = get_posts([
        'name' => sanitize_title($request['slug']),
        'post_type' => 'post',
        'post_status' => 'publish',
        'numberposts' => 1,
    ]);

    if (empty($posts)) {
        return new WP_Error(
            'not_found',
            'Post not found',
            ['status' => 404]
        );
    }

    return rest_ensure_response([
        'success' => true,
        'post' => clean_api_format_post($posts[0]),
    ]);
}